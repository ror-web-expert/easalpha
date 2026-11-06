"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import { useThemeStore } from "@/store/theme";
import { Toaster } from "@/components/ui/toast";
import { ApiError, shareSessionAcrossTabs } from "@/lib/api";
import { UpdateNotice } from "@/components/update-notice";
import { scrubStoredSecrets } from "@/lib/stored-secrets";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && count < 2,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  useEffect(() => {
    // Before the stores load: a branch record saved while the API still sent the tax token is cleaned as it loads (S1).
    const stopScrub = scrubStoredSecrets();
    useAuthStore.persist.rehydrate();
    useDeviceStore.persist.rehydrate();
    useThemeStore.getState().init();
    // A refresh in another tab spends the token this tab holds: follow the pair it saves (review R28).
    const stopSharing = shareSessionAcrossTabs();
    return () => { stopScrub(); stopSharing(); };
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
      <UpdateNotice />
    </QueryClientProvider>
  );
}
