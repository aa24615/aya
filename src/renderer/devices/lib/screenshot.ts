export async function createScreenshotThumbnail(
  imageUrl: string,
  maxWidth = 320,
  maxHeight = 320
) {
  const image = await loadImage(imageUrl)
  const scale = Math.min(
    1,
    maxWidth / image.naturalWidth,
    maxHeight / image.naturalHeight
  )

  if (scale === 1) {
    image.src = ''
    return imageUrl
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    image.src = ''
    return imageUrl
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const thumbnail = canvas.toDataURL('image/webp', 0.8)
  image.src = ''
  return thumbnail
}

function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('SCREENSHOT_THUMBNAIL_FAILED'))
    image.src = imageUrl
  })
}
