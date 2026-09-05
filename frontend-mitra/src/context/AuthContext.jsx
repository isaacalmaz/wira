import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null jika belum login
  const [role, setRole] = useState(null); // 'driver', 'merchant', 'technician'
  
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
