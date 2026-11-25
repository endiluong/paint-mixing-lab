/** Gives the user a file to keep. */
export const saveFile = (name: string, type: string, content: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Some browsers start the download a moment later
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
