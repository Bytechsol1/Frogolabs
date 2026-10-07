export function FieldError({ id, message }: { id: string; message: string }) {
    return message ? <p id={`${id}-error`} role="alert" className="text-xs leading-relaxed text-rose-700">{message}</p> : null;
}
