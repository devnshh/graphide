import io.shiftleft.codepropertygraph.Cpg
import io.shiftleft.codepropertygraph.generated.{Operators, EdgeTypes}
import io.shiftleft.codepropertygraph.generated.nodes._
import io.shiftleft.semanticcpg.language._
import io.shiftleft.semanticcpg.language.NoResolve
import io.joern.dataflowengineoss.language._
import scala.util.Try
// import io.joern.scanners.c.QueryLangExtensions


@main def execute(inputPath: String, outputFile: String): Unit = {
  val n = 10
  val projectName = "vuln_scan_final"
  // val outputFile = args(1) 
  
  // Update this path to your specific file/folder
  val path = inputPath
  // val path = "/Users/ramanjotsingh/Documents/codingTut/x42/test"

  println(s"[-] Analyzing: $path")

  // Cleanup
  if (workspace.project(projectName).isDefined) {
    workspace.deleteProject(projectName)
  }

  println("[-] Importing code...")
  val myCpg = importCode(inputPath = path, projectName = projectName)
  println("[-] CPG Loaded.")

 val queries: List[(String, Cpg => Any)] = List(
  ("call-to-gets", (cpg: Cpg) => cpg.method("(?i)gets").callIn),

  ("call-to-getwd", (cpg: Cpg) => cpg.method("(?i)getwd").callIn),

  ("call-to-scanf", (cpg: Cpg) => cpg.method("(?i)scanf").callIn),

  ("call-to-strcat", (cpg: Cpg) => cpg.method("(?i)(strcat|strncat)").callIn),

  ("call-to-strcpy", (cpg: Cpg) => cpg.method("(?i)(strcpy|strncpy)").callIn),

  ("call-to-strtok", (cpg: Cpg) => cpg.method("(?i)strtok").callIn),


  ("file-operation-race", (cpg: Cpg) => {
    val operations: Map[String, Seq[Int]] = Map(
      "access" -> Seq(1),
      "chdir" -> Seq(1),
      "chmod" -> Seq(1),
      "chown" -> Seq(1),
      "creat" -> Seq(1),
      "faccessat" -> Seq(2),
      "fchmodat" -> Seq(2),
      "fopen" -> Seq(1),
      "fstatat" -> Seq(2),
      "lchown" -> Seq(1),
      "linkat" -> Seq(2, 4),
      "link" -> Seq(1, 2),
      "lstat" -> Seq(1),
      "mkdirat" -> Seq(2),
      "mkdir" -> Seq(1),
      "mkfifoat" -> Seq(2),
      "mkfifo" -> Seq(1),
      "mknodat" -> Seq(2),
      "mknod" -> Seq(1),
      "openat" -> Seq(2),
      "open" -> Seq(1),
      "readlinkat" -> Seq(2),
      "readlink" -> Seq(1),
      "renameat" -> Seq(2, 4),
      "rename" -> Seq(1, 2),
      "rmdir" -> Seq(1),
      "stat" -> Seq(1),
      "unlinkat" -> Seq(2),
      "unlink" -> Seq(1)
    )

    def fileCalls(calls: Iterator[Call]) =
      calls.nameExact(operations.keys.toSeq: _*)

    def fileArgs(c: Call) =
      c.argument.whereNot(_.isLiteral).argumentIndex(operations(c.name): _*)

    fileCalls(cpg.call)
      .filter(call => {
        val otherCalls = fileCalls(call.method.ast.isCall).filter(_ != call)
        val argsForOtherCalls = otherCalls.flatMap(c => fileArgs(c)).code.toSet
        fileArgs(call).code.exists(arg => argsForOtherCalls.contains(arg))
      })
  }),

  ("format-controlled-printf", (cpg: Cpg) => {
    val printfFns = cpg
      .method("(?i)printf")
      .callIn
      .whereNot(_.argument.order(1).isLiteral)
    val sprintsFns = cpg
      .method("(?i)(sprintf|vsprintf)")
      .callIn
      .whereNot(_.argument.order(2).isLiteral)
    (printfFns ++ sprintsFns)
  }),

  // ("free-field-no-reassign", (cpg: Cpg) => {
  //   val freeOfStructField = cpg
  //     .method("free")
  //     .callIn
  //     .where(
  //       _.argument(1)
  //         .isCallTo("<operator>.*[fF]ieldAccess.*")
  //         .filter(x => x.method.parameter.name.toSet.contains(x.argument(1).code))
  //     )
  //     .whereNot(_.argument(1).isCall.argument(1).filter { struct =>
  //       struct.method.ast.isCall
  //         .name(".*free$", "memset", "bzero")
  //         .argument(1)
  //         .codeExact(struct.code)
  //         .nonEmpty
  //     })
  //     .l

  //   freeOfStructField.argument(1).filter { arg =>
  //     arg.method.methodReturn.reachableBy(arg).nonEmpty
  //   }
  // }),

  // ("free-follows-value-reuse", (cpg: Cpg) => cpg.method
  //   .name("(.*_)?free")
  //   .filter(_.parameter.size == 1)
  //   .callIn
  //   .where(_.argument(1).isIdentifier)
  //   .flatMap(f => {
  //     val freedIdentifierCode = f.argument(1).code
  //     val postDom = f.postDominatedBy.toSetImmutable

  //     val assignedPostDom = postDom.isIdentifier
  //       .where(_.inAssignment)
  //       .codeExact(freedIdentifierCode)
  //       .flatMap(id => id ++ id.postDominatedBy)

  //     postDom
  //       .removedAll(assignedPostDom)
  //       .isIdentifier
  //       .codeExact(freedIdentifierCode)
  //   })
  // ),

  ("free-returned-value", (cpg: Cpg) => {
    def outParams =
      cpg.parameter
        .code(".+\\*.+")
        .whereNot(
          _.referencingIdentifiers
            .argumentIndex(1)
            .inCall
            .nameExact(Operators.assignment, Operators.addressOf)
        )

    def assignedValues =
      outParams.referencingIdentifiers
        .argumentIndex(1)
        .inCall
        .nameExact(Operators.indirectFieldAccess, Operators.indirection, Operators.indirectIndexAccess)
        .argumentIndex(1)
        .inCall
        .nameExact(Operators.assignment)
        .argument(2)
        .isIdentifier

    def freeAssigned =
      assignedValues.map(id =>
        (
          id,
          id.refsTo
            .flatMap {
              case p: MethodParameterIn => p.referencingIdentifiers
              case v: Local => v.referencingIdentifiers
            }
            .inCall
            .name("(.*_)?free")
        )
      )

    freeAssigned
      .filter { case (id, freeCall) =>
        freeCall.dominatedBy.exists(_ == id)
      }
      .flatMap(_._1)
  }),

  ("malloc-memcpy-int-overflow", (cpg: Cpg) => {
    val src = cpg.method(".*malloc$").callIn.where(_.argument(1).arithmetic).l

    cpg.method("(?i)memcpy").callIn.l.filter { memcpyCall =>
      memcpyCall
        .argument(1)
        .reachableBy(src)
        .where(_.inAssignment.target.codeExact(memcpyCall.argument(1).code))
        .whereNot(_.argument(1).codeExact(memcpyCall.argument(3).code))
        .hasNext
    }
  }),



  ("setgid-without-setgroups", (cpg: Cpg) => cpg
    .method("(?i)set(res|re|e|)gid")
    .callIn
    .whereNot(_.dominatedBy.isCall.name("setgroups"))
  ),

  ("setuid-without-setgid", (cpg: Cpg) => cpg
    .method("(?i)set(res|re|e|)uid")
    .callIn
    .whereNot(_.dominatedBy.isCall.name("set(res|re|e|)?gid"))
  ),

  // ("signed-left-shift", (cpg: Cpg) => cpg.call
  //   .nameExact(Operators.shiftLeft, Operators.assignmentShiftLeft)
  //   .where(_.argument(1).typ.fullNameExact("int", "long"))
  //   .filterNot(_.argument.isLiteral.size == 2)
  // ),

  ("strlen-truncation", (cpg: Cpg) => cpg.method
    .name("(?i)strlen")
    .callIn
    .inAssignment
    .target
    .evalType("(g?)int")
  ),

  ("strncpy-no-null-term", (cpg: Cpg) => {
    val allocations = cpg.method(".*malloc$").callIn.argument(1).l
    cpg
      .method("(?i)strncpy")
      .callIn
      .map { c =>
        (c.method, c.argument(1), c.argument(3))
      }
      .filter { case (method, dst, size) =>
        dst.reachableBy(allocations).codeExact(size.code).nonEmpty &&
          method.assignment
            .where(_.target.arrayAccess.code(s"${dst.code}.*\\[.*"))
            .source
            .isLiteral
            .code(".*0.*")
            .isEmpty
      }
      .map(_._2)
  }),

  // ("too-high-complexity", (cpg: Cpg) => cpg.method.internal.filter(_.controlStructure.size > n).nameNot("<global>")),

  // ("too-long", (cpg: Cpg) => cpg.method.internal.filter(_.numberOfLines > n).nameNot("<global>")),

  // ("too-many-loops", (cpg: Cpg) => cpg.method.internal
  //   .filter(
  //     _.ast.isControlStructure
  //       .controlStructureType("(FOR|DO|WHILE)")
  //       .size > 4
  //   )
  //   .nameNot("<global>")
  // ),

  // ("too-many-params", (cpg: Cpg) => cpg.method.internal.filter(_.parameter.size > n).nameNot("<global>")),

  // ("too-nested", (cpg: Cpg) => cpg.method.internal.filter(_.depth(_.isControlStructure) > n).nameNot("<global>")),

  // ("unchecked-read-recv-malloc", (cpg: Cpg) => {
  //   implicit val noResolve: NoResolve.type = NoResolve
  //   cpg
  //     .method("(?i)(read|recv|malloc)")
  //     .callIn
  //     .returnValueNotChecked
  // })


  // Java Queries

  ("call-to-exec", (cpg: Cpg) => cpg.method("java.lang.Runtime.exec").callIn),
  ("ineffective-certificate-check", (cpg: Cpg) => {
    val source = cpg.method
      .where(_.methodReturn.evalType("org.springframework.web.servlet.ModelAndView"))
      .parameter
    val sink = cpg.method.name("query").parameter.order(1)
    sink.reachableBy(source).l
  }),
  ("simple-constant-detection", (cpg: Cpg) => {
    cpg.assignment
      .groupBy(_.argument.order(1).code.l)
      .flatMap {
        case (_: List[String], as) =>
          val items = as.l
          if (items.size == 1) items else Nil
        case _ => Nil
      }
      .flatMap { assignment =>
        val argHead = assignment.argument.l.headOption
        val idOpt = argHead.collect { case i: Identifier => i }
        val types = argHead.map(_.typ.l).getOrElse(List.empty)
        idOpt.map(id => (id, types)).toList
      }
      .filter {
        case (_: Identifier, ts: List[Type]) =>
          ts.nonEmpty &&
          ts.head.namespace.l.exists(_.name.contains("<global>")) &&
          !ts.head.fullName.contains("[]")
        case _ => false
      }
      .flatMap {
        case (i: Identifier, _: List[Type]) => Option(i)
        case _                              => Option.empty
      }
  }),
  ("sql-injection", (cpg: Cpg) => {
    val source = cpg.method
      .where(_.methodReturn.evalType("org.springframework.web.servlet.ModelAndView"))
      .parameter
    val sink = cpg.method.name("query").parameter.order(1)
    sink.reachableBy(source).l
  }),
  ("xss-servlet", (cpg: Cpg) => {
    val source = cpg.call.methodFullNameExact(
      "javax.servlet.http.HttpServletRequest.getParameter:java.lang.String(java.lang.String)"
    )

    val responseWriter =
      cpg.call.methodFullNameExact("javax.servlet.http.HttpServletResponse.getWriter:java.io.PrintWriter()")

    val sinks =
      cpg.call
        .methodFullNameExact("java.io.PrintWriter.println:void(java.lang.String)")
        .where(_.argument(0).reachableBy(responseWriter))

    sinks.where(_.argument(1).reachableBy(source))
  }),


)

println("Queries loaded successfully. Total queries: " + queries.size)

  var foundIssues = 0
  val uniqueFunctions = scala.collection.mutable.LinkedHashMap[String, ujson.Obj]()

  queries.foreach { case (name, query) =>
    // 1. Run the query
    val rawResult = query(myCpg)

    // 2. Materialize the result immediately into a List.
    // We treat 'rawResult' as a generic Iterator/Traversal and convert it.
    val resultList: List[StoredNode] = rawResult match {
      case t: scala.collection.IterableOnce[_] => t.iterator.collect { case n: StoredNode => n }.toList
      case _ => List.empty
    }

    // Debug print (optional) - proves we have data
    // println(s"DEBUG: $name -> ${resultList.size} items")

    // 3. Collect unique parent function code entries
    if (resultList.nonEmpty) {
      resultList.foreach { node =>
        val parentMethodCode = Try {
          node match {
            case m: Method => m.code
            case other =>
              val methodName = other.location.methodFullName
              myCpg.method.fullNameExact(methodName).code.headOption.getOrElse("N/A")
          }
        }.getOrElse("N/A")

        if (parentMethodCode != "N/A" && !uniqueFunctions.contains(parentMethodCode)) {
          val l = node.location
          uniqueFunctions(parentMethodCode) = ujson.Obj(
            "parentFunctionCode" -> parentMethodCode,
            "filename" -> l.filename,
            "lineNumber" -> Try(l.lineNumber.toString).getOrElse("unknown")
          )
        }
      }
    }
  }
  // Build final JSON and write to file
  val jsonResult = ujson.Arr(uniqueFunctions.values.toSeq: _*)

  val jsonStr = ujson.write(jsonResult, indent = 2)
  os.write.over(os.Path(outputFile), jsonStr)

  foundIssues = uniqueFunctions.size
  println(s"\n[+] Results saved to: $outputFile")
  println(s"[!] Total unique functions: $foundIssues")

  if (foundIssues == 0) println("[+] No vulnerabilities found.")

  workspace.deleteProject(projectName)
}