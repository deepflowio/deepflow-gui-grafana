class DataStreamer {
  private dataQueue: string[] = []
  private isEnded = false
  private outputInterval: number | undefined
  onEnd: () => void

  constructor(onEnd: () => void) {
    this.onEnd = onEnd
  }

  /**
   * 写入数据到队列
   * @param data 要写入的数据
   */
  write(data: string) {
    this.dataQueue.push(...data)
  }

  /**
   * 注册一个回调函数，按照指定的频率输出数据
   * @param callback 输出数据的回调函数
   * @param frequency 输出频率（毫秒）
   */
  output(callback: (char: string) => void, frequency: number) {
    this.outputInterval = window.setInterval(() => {
      if (this.dataQueue.length > 0) {
        const char = this.dataQueue.shift() as string
        callback(char)
      } else if (this.isEnded) {
        this.cleanup()
      }
    }, frequency)
  }

  /**
   * 结束写入并在所有数据输出后清理
   */
  end() {
    this.isEnded = true
    if (this.dataQueue.length === 0) {
      this.cleanup()
    }
  }

  /**
   * 清理资源
   */
  private cleanup() {
    if (this.outputInterval !== undefined) {
      clearInterval(this.outputInterval)
      this.outputInterval = undefined
      this.onEnd()
    }
  }
}

export default DataStreamer
