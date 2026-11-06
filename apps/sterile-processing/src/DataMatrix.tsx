import { useEffect, useState } from "react";
export function useDataMatrix(identifier: string | undefined) {
  const [image, setImage] = useState<string | null>(null),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    setStatus("loading");
    setImage(null);
    if (!identifier) {
      setStatus("error");
      return;
    }
    void import("bwip-js/browser")
      .then((b) => {
        if (!active) return;
        const svg = b.toSVG({
          bcid: "datamatrix",
          text: identifier,
          scale: 4,
          paddingwidth: 4,
          paddingheight: 4,
          backgroundcolor: "FFFFFF",
        });
        setImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [identifier]);
  return { image, status, setStatus };
}
export function DataMatrix({
  identifier,
  alt,
  onReady,
  loading,
  error,
}: {
  identifier: string | undefined;
  alt: string;
  onReady: (ready: boolean) => void;
  loading: string;
  error: string;
}) {
  const { image, status, setStatus } = useDataMatrix(identifier);
  useEffect(() => {
    onReady(status === "ready");
    return () => onReady(false);
  }, [status, onReady]);
  return (
    <div className="data-matrix">
      <img
        src={image ?? undefined}
        alt={alt}
        hidden={!image || status !== "ready"}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status === "loading" && <p role="status">{loading}</p>}
      {status === "error" && <p role="alert">{error}</p>}
    </div>
  );
}
