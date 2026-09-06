import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('wira_mitra_user')) || null);
  const [role, setRole] = useState(() => localStorage.getItem('wira_mitra_role') || null);
  
  useEffect(() => {
    if (user) {
      localStorage.setItem('wira_mitra_user', JSON.stringify(user));
      localStorage.setItem('wira_mitra_role', role);
    } else {
      localStorage.removeItem('wira_mitra_user');
      localStorage.removeItem('wira_mitra_role');
    }
  }, [user, role]);

  const login = (userData, userRole) => {
    setUser(userData);
    setRole(userRole || userData?.role || 'driver');
  };
  
  const logout = () => {
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
