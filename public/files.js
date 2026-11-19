export async function encodeFile(file) {
  if (!file || file.size > 4 * 1024 * 1024 || file.size === 0) throw new Error('Choose a non-empty file no larger than 4 MB.')
  if (!/\.(pdf|txt|md|csv|png|jpe?g|webp)$/i.test(file.name)) throw new Error('Choose a PDF, text file, PNG, JPG, or WEBP image.')
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read this file.'))
    reader.readAsDataURL(file)
  })
  return { name: file.name, data }
}
