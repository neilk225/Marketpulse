interface Props {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ title = "Something went wrong", message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-terminal-border bg-terminal-panel px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded border border-terminal-border px-4 py-1.5 text-sm text-ink-muted transition-colors hover:bg-terminal-hover hover:text-ink"
        >
          Retry
        </button>
      )}
    </div>
  );
}
