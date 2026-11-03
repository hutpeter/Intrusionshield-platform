/** Separate development entry point; never relax the production service factory. */
export function assertSterilePreviewEnvironment(): void {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.RUBY_STERILE_PREVIEW !== "true"
  ) {
    throw new Error(
      "Sterile preview requires explicit development mode and opt-in.",
    );
  }
}
