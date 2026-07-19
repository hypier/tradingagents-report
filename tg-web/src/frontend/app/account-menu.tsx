import { createContext, type ReactNode, useContext } from 'react';

const AccountMenuContext = createContext<ReactNode>(null);

export function AccountMenuProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: ReactNode;
}) {
  return (
    <AccountMenuContext.Provider value={value}>
      {children}
    </AccountMenuContext.Provider>
  );
}

export function useAccountMenu() {
  return useContext(AccountMenuContext);
}
