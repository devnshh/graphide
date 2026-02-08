export function GraphView() {
    return (
        <div className="h-full relative bg-[#1e1e1e] overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <p className="mb-2">Graph visualization placeholder</p>
                    <p className="text-xs opacity-50">Use 'Analyze' to generate graph data</p>
                </div>
            </div>

            {/* Mock Nodes - Absolute Positioning based on original mock */}
            <div className="absolute top-20 left-10 p-3 bg-[#252526] border border-[#3e3e42] rounded shadow-lg w-40">
                <div className="text-xs text-green-400 mb-1 font-bold">Source</div>
                <div className="font-medium text-sm">Client Request</div>
            </div>

            <div className="absolute top-10 left-60 p-3 bg-[#252526] border border-[#3e3e42] rounded shadow-lg w-40">
                <div className="text-xs text-blue-400 mb-1 font-bold">Process</div>
                <div className="font-medium text-sm">Auth Controller</div>
            </div>

            <div className="absolute top-60 left-60 p-3 bg-[#252526] border border-rose-500/50 bg-rose-900/10 rounded shadow-lg w-40 ring-1 ring-rose-500/30">
                <div className="text-xs text-rose-400 mb-1 font-bold flex items-center gap-1">
                    <span>Taint Source</span>
                </div>
                <div className="font-medium text-sm text-rose-100">User Input</div>
            </div>

            <div className="absolute top-20 left-[30rem] p-3 bg-[#252526] border border-[#3e3e42] rounded shadow-lg w-40">
                <div className="text-xs text-blue-400 mb-1 font-bold">Process</div>
                <div className="font-medium text-sm">Query Builder</div>
            </div>

            <div className="absolute top-20 left-[42rem] p-3 bg-[#252526] border border-rose-500/50 bg-rose-900/10 rounded shadow-lg w-40 ring-1 ring-rose-500/30">
                <div className="text-xs text-rose-400 mb-1 font-bold">Sink</div>
                <div className="font-medium text-sm text-rose-100">PostgreSQL DB</div>
            </div>
        </div>
    );
}
