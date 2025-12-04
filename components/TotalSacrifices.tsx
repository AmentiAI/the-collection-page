export default function TotalSacrifices({ total, className = '' }: { total: number; className?: string }) {
  return (
    <div
      className={[
        'rounded-full border border-red-600/50 bg-red-900/20 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.35em] text-red-200',
        className,
      ].join(' ')}
    >
      Total Sacrifices: <span className="text-red-100">{total}</span>
    </div>
  )
}


