"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import { useThemeStore } from "@/store/theme";
import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { UpdateNotice } from "@/components/update-notice";

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
    useAuthStore.persist.rehydrate();
    useDeviceStore.persist.rehydrate();
    useThemeStore.getState().init();
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
      <UpdateNotice />
    </QueryClientProvider>
  );
}
