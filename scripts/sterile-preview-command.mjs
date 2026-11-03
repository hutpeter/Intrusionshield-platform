/** Keep native pnpm executables out of Node's JavaScript loader. No shell parsing. */
export function packageManagerCommand(packageManagerPath, nodePath, args) {
  if (
    typeof packageManagerPath !== "string" ||
    !packageManagerPath ||
    typeof nodePath !== "string" ||
    !nodePath
  ) {
    throw new Error("A package-manager and Node executable are required.");
  }
  return /\.exe$/i.test(packageManagerPath)
    ? { file: packageManagerPath, args: [...args] }
    : { file: nodePath, args: [packageManagerPath, ...args] };
}
