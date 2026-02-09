export default function BookingDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-6 w-36 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-8 w-12 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Status Banner Skeleton */}
        <div className="bg-white rounded-lg border border-gray-100 p-4 flex items-center space-x-3">
          <div className="h-6 w-6 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Detail Card Skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center px-4 py-3">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Actions Skeleton */}
        <div className="space-y-2">
          <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
