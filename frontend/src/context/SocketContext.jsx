import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../utils/axiosConfig';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState([]);

  // Initial fetch of unread count
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
    }
  }, [user]);

  const fetchUnreadCount = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setMessageCount(data.messageCount || 0);
      setNotificationCount(data.notificationCount || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  useEffect(() => {
    if (!user) {
      setSocket((currentSocket) => {
        if (currentSocket) {
          currentSocket.close();
        }
        return null;
      });
      setOnlineUserIds([]);
      return;
    }

    let newSocket;

    try {
      const token = localStorage.getItem('token');

      const handleOnlineUsers = (userIds = []) => {
        if (!Array.isArray(userIds)) {
          setOnlineUserIds([]);
          return;
        }

        const normalizedUserIds = [...new Set(userIds.map((id) => String(id)))];
        setOnlineUserIds(normalizedUserIds);
      };

      newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
        withCredentials: true,
        auth: token ? { token } : undefined,
      });

      setSocket(newSocket);

      newSocket.on('receive_message', (message) => {
        const senderId =
          typeof message.sender === 'object'
            ? message.sender?._id
            : message.sender;

        // If the message is NOT from the user themselves, increment message count
        if (String(senderId) !== String(user._id)) {
          setMessageCount((prev) => prev + 1);
        }
      });

      // Listen for new notifications (system)
      newSocket.on('new_notification', () => {
        setNotificationCount((prev) => prev + 1);
      });

      newSocket.on('online_users', handleOnlineUsers);

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection failed:', error?.message || error);
      });
    } catch (error) {
      console.error('Socket setup failed:', error);
    }

    // Cleanup
    return () => {
      if (newSocket) newSocket.close();
    };
  }, [user]);

  // Value to expose
  const value = {
    socket,
    messageCount,
    notificationCount,
    onlineUserIds,
    setMessageCount,
    setNotificationCount,
    fetchUnreadCount,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
