import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
    type RefObject
} from "react";

type DialogOffset = {
    x: number;
    y: number;
};

type DraggableDialog = {
    dialogRef: RefObject<HTMLDivElement | null>;
    dialogStyle: CSSProperties;
    onHeaderMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

/** Shared Ruby draggable-dialog behaviour. */
export function useDraggableDialog(isOpen: boolean): DraggableDialog {
    const dialogRef = useRef<HTMLDivElement>(null);
    const [offset, setOffset] = useState<DialogOffset>({ x: 0, y: 0 });

    useEffect(() => {
        if (!isOpen) setOffset({ x: 0, y: 0 });
    }, [isOpen]);

    const onHeaderMouseDown = useCallback(
        (event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;

            const target = event.target as HTMLElement;
            if (target.closest("button, input, select, textarea, a, [data-no-drag]")) {
                return;
            }

            const dialog = dialogRef.current;
            if (!dialog) return;

            event.preventDefault();
            const rect = dialog.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startOffset = offset;
            const margin = 12;

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const rawX = startOffset.x + moveEvent.clientX - startX;
                const rawY = startOffset.y + moveEvent.clientY - startY;
                const minX = startOffset.x + margin - rect.left;
                const maxX = startOffset.x + window.innerWidth - margin - rect.right;
                const minY = startOffset.y + margin - rect.top;
                const maxY = startOffset.y + window.innerHeight - margin - rect.bottom;

                setOffset({
                    x: Math.min(maxX, Math.max(minX, rawX)),
                    y: Math.min(maxY, Math.max(minY, rawY))
                });
            };

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        },
        [offset]
    );

    return {
        dialogRef,
        dialogStyle: { transform: `translate(${offset.x}px, ${offset.y}px)` },
        onHeaderMouseDown
    };
}
