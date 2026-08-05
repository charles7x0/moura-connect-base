interface ErrorMessageProps { message: string; }
export function ErrorMessage({ message }: ErrorMessageProps) {
  return <p className="text-xs text-isa-alarm-critical border border-isa-alarm-critical/30 bg-isa-alarm-critical/10 px-3 py-2 rounded">{message}</p>;
}
