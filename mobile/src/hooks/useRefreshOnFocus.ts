import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export function useRefreshOnFocus(refetch: () => void) {
  const isFirstMount = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstMount.current) {
        isFirstMount.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
