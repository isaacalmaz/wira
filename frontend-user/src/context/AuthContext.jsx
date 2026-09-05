import { createContext, useContext, useState } from 'react';
import { getStorage, setStorage, removeStorage } from '../utils/localStorage';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStorage('wira_user', null));
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getStorage('wira_user', null));

  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    setStorage('wira_user', userData);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    removeStorage('wira_user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
