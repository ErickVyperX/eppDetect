import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { soundService } from '../services/sound';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('epp_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('epp_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    soundService.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const userData = await api.getMe(token);
          setUser(userData);
          localStorage.setItem('epp_user', JSON.stringify(userData));
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [token]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem('epp_token', data.access_token);
    localStorage.setItem('epp_user', JSON.stringify(data.user));
    // Inicializar audio al interactuar con el login
    soundService.init();
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('epp_token');
    localStorage.removeItem('epp_user');
  };

  const toggleSound = () => {
    setSoundEnabled(prev => !prev);
  };

  return (
    <AuthContext.Provider value={{
      token,
      user,
      login,
      logout,
      loading,
      soundEnabled,
      toggleSound
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
