interface LoadingStateProps {
  message?: string;
  skeleton?: boolean;
}

export default function LoadingState({ message = 'Loading...', skeleton = false }: LoadingStateProps) {
  if (skeleton) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>

        <div className="px-4 py-6 space-y-4">
          {/* Profile Card Skeleton */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Packages Section Skeleton */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-20 bg-gray-100 rounded animate-pulse"></div>
              <div className="h-20 bg-gray-100 rounded animate-pulse"></div>
            </div>
          </div>

          {/* Bookings Section Skeleton */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-16 bg-gray-100 rounded animate-pulse"></div>
              <div className="h-16 bg-gray-100 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
