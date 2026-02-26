const isFifoQueue = (queueName: string): boolean => {
  return queueName.toLowerCase().endsWith('.fifo')
}

export { isFifoQueue }
