function Skeleton({ className }) {
  return (
    <div className={`animate-pulse bg-gray-800 rounded-xl ${className}`} />
  )
}

function AssetCardSkeleton() {
  return (
    <div className="bg-gray-900 p-4 rounded-xl">
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-8 w-24 mb-2" />
      <Skeleton className="h-3 w-12 mb-4" />
      <Skeleton className="h-8 w-20" />
    </div>
  )
}

function PositionSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-4">
      <div className="w-32">
        <Skeleton className="h-4 w-16 mb-2" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export { Skeleton, AssetCardSkeleton, PositionSkeleton }