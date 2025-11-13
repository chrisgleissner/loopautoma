import { useEffect, useRef } from "react";

export function useEffectOnce(fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      done.current = true;
      fn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
