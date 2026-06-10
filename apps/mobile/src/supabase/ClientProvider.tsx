import React, { createContext, useContext, type PropsWithChildren } from 'react';

import type { PabloClient } from './types';

const ClientContext = createContext<PabloClient | null>(null);

type Props = PropsWithChildren<{
  readonly client: PabloClient;
}>;

export function ClientProvider({ client, children }: Props) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function usePabloClient(): PabloClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error('usePabloClient used outside ClientProvider');
  }
  return client;
}
