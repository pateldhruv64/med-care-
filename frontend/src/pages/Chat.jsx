import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send,
  MessageSquare,
  Search,
  Phone,
  Video,
  ArrowLeft,
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../utils/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext'; // Import useSocket

const Chat = () => {
  const { user } = useAuth();
  const { socket, fetchUnreadCount, onlineUserIds } = useSocket(); // Use global socket and refetcher
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Removed local socket initialization effect

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get(`/chat/users?t=${new Date().getTime()}`);
        setUsers(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching users:', error);
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;

    const fetchMessages = async () => {
      try {
        const { data } = await api.get(`/chat/${selectedUser._id}`);
        setMessages(data);
        scrollToBottom();

        // Mark messages as read when opening chat
        await api.put(`/chat/read/${selectedUser._id}`);
        fetchUnreadCount(); // Update global unread count

        // Also clear local unread status
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u._id === selectedUser._id ? { ...u, hasUnread: false } : u,
          ),
        );
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };
    fetchMessages();
  }, [selectedUser]); // Removed fetchUnreadCount dependency to avoid loops

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      const senderId = message.sender?._id || message.sender;

      // Reorder users and set unread status
      setUsers((prevUsers) => {
        const senderIndex = prevUsers.findIndex((u) => u._id === senderId);
        if (senderIndex === -1) return prevUsers;

        const updatedUsers = [...prevUsers];
        const sender = { ...updatedUsers[senderIndex] };

        // If not currently chatting with this user, mark as unread
        if (!selectedUser || selectedUser._id !== senderId) {
          sender.unreadCount = (sender.unreadCount || 0) + 1;
          // sender.hasUnread = true; // Removed
        } else {
          // If chatting, it's read
          sender.unreadCount = 0;
        }

        updatedUsers.splice(senderIndex, 1);
        updatedUsers.unshift(sender);
        return updatedUsers;
      });

      // If chatting with this user, append message
      if (
        selectedUser &&
        (senderId === selectedUser._id || senderId === user._id)
      ) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();

        // If the message is from the selected user, mark it as read immediately
        if (senderId === selectedUser._id) {
          api.put(`/chat/read/${senderId}`).then(() => fetchUnreadCount());
        }
      }
    };

    socket.on('receive_message', handleReceiveMessage);

    return () => socket.off('receive_message', handleReceiveMessage);
  }, [socket, selectedUser, user._id]); // removed fetchUnreadCount to act safely

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const { data } = await api.post('/chat/send', {
        receiverId: selectedUser._id,
        message: newMessage,
      });

      setMessages((prev) => [...prev, data]);
      setNewMessage('');

      // Move receiver to top
      setUsers((prevUsers) => {
        const receiverIndex = prevUsers.findIndex(
          (u) => u._id === selectedUser._id,
        );
        if (receiverIndex === -1) return prevUsers;

        const updatedUsers = [...prevUsers];
        const receiver = updatedUsers[receiverIndex];
        updatedUsers.splice(receiverIndex, 1);
        updatedUsers.unshift(receiver);
        return updatedUsers;
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleUserSelect = (u) => {
    setSelectedUser(u);
    // Clear unread status locally
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user._id === u._id ? { ...user, unreadCount: 0 } : user,
      ),
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.lastName?.toLowerCase() || '').includes(searchTerm.toLowerCase()),
  );

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`;
  };

  const onlineUserIdSet = useMemo(
    () => new Set((onlineUserIds || []).map((id) => String(id))),
    [onlineUserIds],
  );

  const isUserOnline = (chatUser) =>
    onlineUserIdSet.has(String(chatUser?._id || '')) ||
    chatUser?.activityStatus === 'Online';

  const activeSelectedUser =
    users.find((u) => u._id === selectedUser?._id) || selectedUser;
  const isActiveSelectedUserOnline = isUserOnline(activeSelectedUser);

  return (
    <div className="h-[calc(100dvh-10rem)] sm:h-[calc(100dvh-9rem)] md:h-[calc(100dvh-2rem)] flex gap-0 md:gap-6 text-slate-800 dark:text-slate-100">
      {/* Users Sidebar */}
      <div
        className={`${selectedUser ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-soft-dark border border-slate-100 dark:border-slate-700 flex-col overflow-hidden`}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <MessageSquare className="text-cyan-500" /> Messages
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              Loading users...
            </div>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((u) => {
              const isSelectedUser = selectedUser?._id === u._id;

              return (
                <div
                  key={u._id}
                  onClick={() => handleUserSelect(u)}
                  className={`p-4 flex items-center gap-3 cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800 border-l-2 ${
                    isSelectedUser
                      ? 'bg-slate-100 dark:bg-slate-800/95 border-l-cyan-400 shadow-sm'
                      : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="relative">
                    {u.profileImage ? (
                      <img
                        src={u.profileImage}
                        alt=""
                        crossOrigin="anonymous"
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200 font-bold">
                        {getInitials(u.firstName, u.lastName)}
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${isUserOnline(u) ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-500'}`}
                    ></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <h3
                        className={`font-semibold truncate ${
                          u.unreadCount > 0
                            ? 'text-slate-900 dark:text-slate-100 font-bold'
                            : isSelectedUser
                              ? 'text-slate-900 dark:text-slate-100'
                              : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {u.firstName} {u.lastName}
                      </h3>
                      {u.unreadCount > 0 && (
                        <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {u.unreadCount > 9 ? '9+' : u.unreadCount}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs truncate ${
                        u.unreadCount > 0
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : isSelectedUser
                            ? 'text-slate-600 dark:text-slate-300'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {u.unreadCount > 0
                        ? 'New message'
                        : `${u.role} • ${isUserOnline(u) ? 'Online' : 'Offline'}`}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              No users found
            </div>
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div
        className={`${selectedUser ? 'flex' : 'hidden md:flex'} w-full flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-soft-dark border border-slate-100 dark:border-slate-700 flex-col overflow-hidden`}
      >
        {activeSelectedUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="md:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>

                {activeSelectedUser.profileImage ? (
                  <img
                    src={activeSelectedUser.profileImage}
                    alt=""
                    crossOrigin="anonymous"
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-700 dark:text-cyan-300 font-bold">
                    {getInitials(
                      activeSelectedUser.firstName,
                      activeSelectedUser.lastName,
                    )}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">
                    {activeSelectedUser.firstName} {activeSelectedUser.lastName}
                  </h3>
                  <p
                    className={`text-xs flex items-center gap-1 ${isActiveSelectedUserOnline ? 'text-green-500' : 'text-slate-400'}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isActiveSelectedUserOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-500'}`}
                    ></span>
                    {isActiveSelectedUserOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-500/20 rounded-full transition-colors">
                  <Phone size={20} />
                </button>
                <button className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-500/20 rounded-full transition-colors">
                  <Video size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/40">
              {messages.map((msg, index) => {
                const isMe =
                  String(msg.sender?._id || msg.sender) === String(user._id);
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={index}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        isMe
                          ? 'bg-cyan-500 text-white rounded-br-none'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none shadow-sm'
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p
                        className={`text-[10px] mt-1 text-right ${isMe ? 'text-cyan-100' : 'text-slate-400 dark:text-slate-500'}`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-none rounded-xl focus:ring-1 focus:ring-cyan-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors shadow-lg shadow-cyan-500/20"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50/30 dark:bg-slate-950/40">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <MessageSquare
                size={40}
                className="text-slate-300 dark:text-slate-600"
              />
            </div>
            <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">
              Select a user to start chatting
            </h3>
            <p className="text-sm">
              Choose from the list on the left to send a message.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
