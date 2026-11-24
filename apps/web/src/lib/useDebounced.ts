import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `ms` (used so typing in a search box does not hit the server on every key). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
