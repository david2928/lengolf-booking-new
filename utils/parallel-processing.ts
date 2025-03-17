interface ParallelOptions {
  timeout?: number;
}

type Task<T> = () => Promise<T>;

export async function executeParallel<T>(tasks: Task<T>[], options: ParallelOptions = {}): Promise<T[]> {
  const { timeout = 10000 } = options;
  
  return Promise.all(
    tasks.map(task => {
      // Add timeout to each task
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Task timed out after ${timeout}ms`)), timeout);
      });
      
      return Promise.race([task(), timeoutPromise]);
    })
  );
} 