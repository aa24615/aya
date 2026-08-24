export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  if (items.length === 0) {
    return []
  }

  const results = new Array<R>(items.length)
  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(concurrency))
  )
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker))
  return results
}

export class ConcurrencyQueue {
  private activeCount = 0
  private readonly concurrency: number
  private readonly pendingTasks: Array<() => void> = []

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, Math.floor(concurrency))
  }

  run<T>(task: () => Promise<T>, priority = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const pendingTask = () => {
        this.activeCount += 1
        Promise.resolve()
          .then(task)
          .then(
            (result) => {
              resolve(result)
              this.completeTask()
            },
            (error) => {
              reject(error)
              this.completeTask()
            }
          )
      }
      if (priority) {
        this.pendingTasks.unshift(pendingTask)
      } else {
        this.pendingTasks.push(pendingTask)
      }
      this.startTasks()
    })
  }

  private completeTask() {
    this.activeCount -= 1
    this.startTasks()
  }

  private startTasks() {
    while (
      this.activeCount < this.concurrency &&
      this.pendingTasks.length > 0
    ) {
      this.pendingTasks.shift()?.()
    }
  }
}
