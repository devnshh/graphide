from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


class RepositoryGraphManager:
    SUPPORTED_EXTENSIONS: Dict[str, str] = {
        ".c": "c",
        ".cc": "cpp",
        ".cpp": "cpp",
        ".cxx": "cpp",
        ".cs": "csharp",
        ".go": "go",
        ".h": "c",
        ".hpp": "cpp",
        ".java": "java",
        ".js": "javascript",
        ".jsx": "javascript",
        ".kt": "kotlin",
        ".kts": "kotlin",
        ".mjs": "javascript",
        ".py": "python",
        ".rb": "ruby",
        ".rs": "rust",
        ".swift": "swift",
        ".ts": "typescript",
        ".tsx": "typescript",
    }

    IGNORED_DIRS: Set[str] = {
        ".git",
        ".hg",
        ".idea",
        ".next",
        ".turbo",
        ".venv",
        ".vscode",
        "__pycache__",
        "bin",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "out",
        "target",
        "tmp",
        "venv",
    }

    IGNORED_FILE_SUFFIXES: Tuple[str, ...] = (".min.js", ".bundle.js", ".pyc")
    MAX_RENDER_FILES = 2200
    MAX_SYMBOLS_PER_FILE = 10

    def get_repository_graph(self, target_path: str) -> Dict[str, Any]:
        resolved_path = Path(target_path).expanduser().resolve()
        if not resolved_path.exists():
            raise FileNotFoundError(f"Path not found: {target_path}")
        repo_root = self._resolve_repo_root(resolved_path)
        all_source_files = self._collect_source_files(repo_root)

        truncated = False
        truncated_reason = ""
        source_files = list(all_source_files)
        if len(source_files) > self.MAX_RENDER_FILES:
            source_files = source_files[: self.MAX_RENDER_FILES]
            truncated = True
            truncated_reason = (
                f"Showing the first {self.MAX_RENDER_FILES} source files to keep the side-panel graph responsive."
            )

        include_symbols = len(source_files) <= 1200
        node_map: Dict[str, Dict[str, Any]] = {}
        relationships: List[Dict[str, Any]] = []
        seen_relationships: Set[str] = set()
        file_id_by_relative_path: Dict[str, str] = {}
        module_index: Dict[str, str] = {}
        relative_paths: Set[str] = set()

        project_id = self._node_id("project", str(repo_root))
        self._upsert_node(
            node_map,
            {
                "id": project_id,
                "label": "Project",
                "properties": {
                    "name": repo_root.name,
                    "filePath": str(repo_root),
                    "relativePath": ".",
                },
            },
        )

        folder_ids: Dict[str, str] = {"": project_id}

        for file_path in source_files:
            rel_path = self._relative_path(repo_root, file_path)
            relative_paths.add(rel_path)
            extension = file_path.suffix.lower()
            language = self.SUPPORTED_EXTENSIONS.get(extension, "text")
            parent_folder_id = self._ensure_folder_hierarchy(
                repo_root=repo_root,
                relative_path=rel_path,
                project_id=project_id,
                folder_ids=folder_ids,
                node_map=node_map,
                relationships=relationships,
                seen_relationships=seen_relationships,
            )

            file_id = self._node_id("file", rel_path)
            file_id_by_relative_path[rel_path] = file_id
            module_index[self._module_key(rel_path)] = file_id
            self._upsert_node(
                node_map,
                {
                    "id": file_id,
                    "label": "File",
                    "properties": {
                        "name": file_path.name,
                        "filePath": str(file_path),
                        "relativePath": rel_path,
                        "language": language,
                    },
                },
            )
            self._add_relationship(
                relationships,
                seen_relationships,
                source_id=parent_folder_id,
                target_id=file_id,
                rel_type="CONTAINS",
                confidence=1.0,
                reason="Folder contains file",
            )

        for file_path in source_files:
            rel_path = self._relative_path(repo_root, file_path)
            file_id = file_id_by_relative_path[rel_path]
            language = self.SUPPORTED_EXTENSIONS.get(file_path.suffix.lower(), "text")
            content = self._read_text(file_path)
            if not content:
                continue

            if include_symbols:
                for symbol in self._extract_symbols(content, language)[: self.MAX_SYMBOLS_PER_FILE]:
                    symbol_id = self._node_id("symbol", f"{rel_path}:{symbol['name']}:{symbol['line']}")
                    self._upsert_node(
                        node_map,
                        {
                            "id": symbol_id,
                            "label": symbol["label"],
                            "properties": {
                                "name": symbol["name"],
                                "filePath": str(file_path),
                                "relativePath": rel_path,
                                "language": language,
                                "startLine": symbol["line"],
                                "endLine": symbol["line"],
                            },
                        },
                    )
                    self._add_relationship(
                        relationships,
                        seen_relationships,
                        source_id=file_id,
                        target_id=symbol_id,
                        rel_type="DEFINES",
                        confidence=0.95,
                        reason="File defines symbol",
                    )

            for target_rel_path in self._resolve_local_imports(
                content=content,
                language=language,
                repo_root=repo_root,
                current_relative_path=rel_path,
                known_relative_paths=relative_paths,
                module_index=module_index,
            ):
                target_file_id = file_id_by_relative_path.get(target_rel_path)
                if not target_file_id:
                    continue
                self._add_relationship(
                    relationships,
                    seen_relationships,
                    source_id=file_id,
                    target_id=target_file_id,
                    rel_type="IMPORTS",
                    confidence=0.9,
                    reason="Local dependency reference",
                )

        label_counts: Dict[str, int] = {}
        for node in node_map.values():
            label = node["label"]
            label_counts[label] = label_counts.get(label, 0) + 1

        return {
            "status": "success",
            "graphKind": "repository",
            "repoRoot": str(repo_root),
            "scopePath": str(resolved_path),
            "nodes": list(node_map.values()),
            "relationships": relationships,
            "nodeCount": len(node_map),
            "edgeCount": len(relationships),
            "counts": {
                "folders": label_counts.get("Folder", 0),
                "files": label_counts.get("File", 0),
                "symbols": sum(
                    label_counts.get(label, 0)
                    for label in ("Class", "Function", "Method", "Interface", "Enum", "Struct")
                ),
                "imports": sum(1 for rel in relationships if rel["type"] == "IMPORTS"),
            },
            "truncated": truncated,
            "truncatedReason": truncated_reason,
            "symbolMode": "full" if include_symbols else "file-only",
            "sourceFileCount": len(all_source_files),
            "renderedFileCount": len(source_files),
        }

    def _resolve_repo_root(self, target_path: Path) -> Path:
        current = target_path if target_path.is_dir() else target_path.parent
        for candidate in (current, *current.parents):
            if (candidate / ".git").exists():
                return candidate
        return current

    def _collect_source_files(self, repo_root: Path) -> List[Path]:
        source_files: List[Path] = []
        for root, dirs, files in os.walk(repo_root):
            dirs[:] = sorted(
                directory
                for directory in dirs
                if directory not in self.IGNORED_DIRS and not directory.startswith(".cache")
            )
            for filename in sorted(files):
                if filename.startswith("."):
                    continue
                if filename.endswith(self.IGNORED_FILE_SUFFIXES):
                    continue
                file_path = Path(root) / filename
                extension = file_path.suffix.lower()
                if extension not in self.SUPPORTED_EXTENSIONS:
                    continue
                source_files.append(file_path)
        return source_files

    def _ensure_folder_hierarchy(
        self,
        repo_root: Path,
        relative_path: str,
        project_id: str,
        folder_ids: Dict[str, str],
        node_map: Dict[str, Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        seen_relationships: Set[str],
    ) -> str:
        parts = Path(relative_path).parts[:-1]
        if not parts:
            return project_id

        current_parent = project_id
        current_path = Path()
        for part in parts:
            current_path = current_path / part
            folder_key = current_path.as_posix()
            folder_id = folder_ids.get(folder_key)
            if folder_id:
                current_parent = folder_id
                continue

            folder_id = self._node_id("folder", folder_key)
            folder_ids[folder_key] = folder_id
            self._upsert_node(
                node_map,
                {
                    "id": folder_id,
                    "label": "Folder",
                    "properties": {
                        "name": part,
                        "filePath": str(repo_root / current_path),
                        "relativePath": folder_key,
                    },
                },
            )
            self._add_relationship(
                relationships,
                seen_relationships,
                source_id=current_parent,
                target_id=folder_id,
                rel_type="CONTAINS",
                confidence=1.0,
                reason="Folder hierarchy",
            )
            current_parent = folder_id

        return current_parent

    def _extract_symbols(self, content: str, language: str) -> List[Dict[str, Any]]:
        lines = content.splitlines()
        symbols: List[Dict[str, Any]] = []
        patterns = self._symbol_patterns(language)
        if not patterns:
            return symbols

        for line_number, line in enumerate(lines, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith(("//", "#", "*")):
                continue
            for pattern, label, group_index in patterns:
                match = pattern.match(line)
                if not match:
                    continue
                name = match.group(group_index)
                if not name:
                    continue
                symbols.append({"name": name, "label": label, "line": line_number})
                break

        deduped: List[Dict[str, Any]] = []
        seen: Set[Tuple[str, str]] = set()
        for symbol in symbols:
            key = (symbol["label"], symbol["name"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(symbol)
        return deduped

    def _symbol_patterns(self, language: str) -> List[Tuple[re.Pattern[str], str, int]]:
        common_patterns = {
            "python": [
                (re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)"), "Function", 1),
            ],
            "javascript": [
                (re.compile(r"^\s*export\s+default\s+class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*(?:export\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)"), "Enum", 1),
                (re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)"), "Function", 1),
                (
                    re.compile(
                        r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b)"
                    ),
                    "Function",
                    1,
                ),
            ],
            "typescript": [
                (re.compile(r"^\s*export\s+default\s+class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)"), "Struct", 1),
                (re.compile(r"^\s*(?:export\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)"), "Enum", 1),
                (re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)"), "Function", 1),
                (
                    re.compile(
                        r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b)"
                    ),
                    "Function",
                    1,
                ),
            ],
            "java": [
                (re.compile(r"^\s*(?:public\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:public\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*(?:public\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)"), "Enum", 1),
                (
                    re.compile(
                        r"^\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{?"
                    ),
                    "Method",
                    1,
                ),
            ],
            "go": [
                (re.compile(r"^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\b"), "Struct", 1),
                (re.compile(r"^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+interface\b"), "Interface", 1),
                (re.compile(r"^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\("), "Function", 1),
            ],
            "rust": [
                (re.compile(r"^\s*(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)"), "Struct", 1),
                (re.compile(r"^\s*(?:pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)"), "Enum", 1),
                (re.compile(r"^\s*(?:pub\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*(?:pub\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)"), "Function", 1),
            ],
            "c": [
                (re.compile(r"^\s*(?:typedef\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)"), "Struct", 1),
                (
                    re.compile(
                        r"^\s*(?:static\s+)?(?:inline\s+)?[\w\*\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{"
                    ),
                    "Function",
                    1,
                ),
            ],
            "cpp": [
                (re.compile(r"^\s*(?:template<[^>]+>\s*)?(?:class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (
                    re.compile(
                        r"^\s*(?:template<[^>]+>\s*)?(?:static\s+)?(?:inline\s+)?[\w:<>\*&\s]+\s+([A-Za-z_][A-Za-z0-9_:]*)\s*\([^;]*\)\s*(?:const\s*)?\{"
                    ),
                    "Method",
                    1,
                ),
            ],
            "csharp": [
                (re.compile(r"^\s*(?:public|private|internal|protected)?\s*class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:public|private|internal|protected)?\s*interface\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (
                    re.compile(
                        r"^\s*(?:public|private|internal|protected|static|async|virtual|override|\s)+[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{?"
                    ),
                    "Method",
                    1,
                ),
            ],
            "kotlin": [
                (re.compile(r"^\s*(?:data\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*interface\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "Function", 1),
            ],
            "swift": [
                (re.compile(r"^\s*(?:public\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)"), "Class", 1),
                (re.compile(r"^\s*(?:public\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)"), "Struct", 1),
                (re.compile(r"^\s*(?:public\s+)?protocol\s+([A-Za-z_][A-Za-z0-9_]*)"), "Interface", 1),
                (re.compile(r"^\s*(?:public\s+)?func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("), "Function", 1),
            ],
            "ruby": [
                (re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*)"), "Class", 1),
                (re.compile(r"^\s*module\s+([A-Za-z_][A-Za-z0-9_:]*)"), "Struct", 1),
                (re.compile(r"^\s*def\s+([A-Za-z_][A-Za-z0-9_!?=]*)"), "Method", 1),
            ],
        }
        return common_patterns.get(language, [])

    def _resolve_local_imports(
        self,
        content: str,
        language: str,
        repo_root: Path,
        current_relative_path: str,
        known_relative_paths: Set[str],
        module_index: Dict[str, str],
    ) -> Iterable[str]:
        if language in {"javascript", "typescript"}:
            return self._resolve_js_imports(content, current_relative_path, known_relative_paths)
        if language == "python":
            return self._resolve_python_imports(content, repo_root, current_relative_path, known_relative_paths)
        return []

    def _resolve_js_imports(
        self,
        content: str,
        current_relative_path: str,
        known_relative_paths: Set[str],
    ) -> List[str]:
        matches = re.findall(
            r"(?:import\s+(?:[^;]+?\s+from\s+)?|export\s+[^;]+?\s+from\s+|require\()\s*['\"]([^'\"]+)['\"]",
            content,
        )
        current_dir = Path(current_relative_path).parent
        resolved: List[str] = []
        for match in matches:
            if not match.startswith("."):
                continue
            for candidate in self._candidate_relative_modules(current_dir, match):
                if candidate in known_relative_paths:
                    resolved.append(candidate)
                    break
        return resolved

    def _resolve_python_imports(
        self,
        content: str,
        repo_root: Path,
        current_relative_path: str,
        known_relative_paths: Set[str],
    ) -> List[str]:
        resolved: List[str] = []
        current_dir = Path(current_relative_path).parent

        for module_path in re.findall(r"^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+", content, re.MULTILINE):
            candidate = module_path.replace(".", "/")
            resolved.extend(self._python_module_candidates(candidate, known_relative_paths))

        for module_path in re.findall(r"^\s*import\s+([A-Za-z0-9_\.]+)", content, re.MULTILINE):
            candidate = module_path.replace(".", "/")
            resolved.extend(self._python_module_candidates(candidate, known_relative_paths))

        for dots, module in re.findall(r"^\s*from\s+(\.+)([A-Za-z0-9_\.]*)\s+import\s+", content, re.MULTILINE):
            base_dir = current_dir
            for _ in range(max(len(dots) - 1, 0)):
                base_dir = base_dir.parent
            if module:
                relative_module = (base_dir / module.replace(".", "/")).as_posix()
            else:
                relative_module = base_dir.as_posix()
            resolved.extend(self._python_module_candidates(relative_module, known_relative_paths))

        deduped: List[str] = []
        seen: Set[str] = set()
        for item in resolved:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        return deduped

    def _python_module_candidates(self, module_path: str, known_relative_paths: Set[str]) -> List[str]:
        candidates = [
            f"{module_path}.py",
            f"{module_path}/__init__.py",
        ]
        return [candidate for candidate in candidates if candidate in known_relative_paths]

    def _candidate_relative_modules(self, current_dir: Path, raw_import: str) -> List[str]:
        base = os.path.normpath((current_dir / raw_import).as_posix()).replace("\\", "/")
        candidates = [
            base,
            f"{base}.ts",
            f"{base}.tsx",
            f"{base}.js",
            f"{base}.jsx",
            f"{base}.mjs",
            f"{base}/index.ts",
            f"{base}/index.tsx",
            f"{base}/index.js",
            f"{base}/index.jsx",
            f"{base}/index.mjs",
        ]
        return [candidate.replace("//", "/") for candidate in candidates if not candidate.startswith("../")]

    def _module_key(self, relative_path: str) -> str:
        path = Path(relative_path)
        if path.name == "__init__.py":
            return path.parent.as_posix().replace("/", ".")
        without_suffix = path.with_suffix("").as_posix()
        return without_suffix.replace("/", ".")

    def _read_text(self, file_path: Path) -> str:
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                return file_path.read_text(encoding="latin-1")
            except Exception:
                return ""
        except Exception:
            return ""

    def _relative_path(self, repo_root: Path, file_path: Path) -> str:
        return file_path.relative_to(repo_root).as_posix()

    def _node_id(self, prefix: str, value: str) -> str:
        digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
        return f"{prefix}_{digest}"

    def _relationship_id(self, source_id: str, rel_type: str, target_id: str) -> str:
        return f"{source_id}:{rel_type}:{target_id}"

    def _upsert_node(self, node_map: Dict[str, Dict[str, Any]], node: Dict[str, Any]) -> None:
        node_map[node["id"]] = node

    def _add_relationship(
        self,
        relationships: List[Dict[str, Any]],
        seen_relationships: Set[str],
        source_id: str,
        target_id: str,
        rel_type: str,
        confidence: float,
        reason: str,
    ) -> None:
        relationship_id = self._relationship_id(source_id, rel_type, target_id)
        if relationship_id in seen_relationships:
            return
        seen_relationships.add(relationship_id)
        relationships.append(
            {
                "id": relationship_id,
                "sourceId": source_id,
                "targetId": target_id,
                "type": rel_type,
                "confidence": confidence,
                "reason": reason,
            }
        )
