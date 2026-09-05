import React, { useState } from 'react';
import { activeChats, chatMessages } from '../data/chats';
import ChatInterface from '../components/shared/ChatInterface';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/shared/UIComponents';

const ChatPage = () => {
  const { role } = useAuth();
  const [selectedChat, setSelectedChat] = useState(null);

  const getQuickReplies = () => {
    if(role === 'driver') return ['Saya sedang menuju lokasi', 'Sudah sampai', 'Mohon tunggu sebentar', 'Sesuai aplikasi ya'];
    if(role === 'merchant') return ['Pesanan sedang dipreparasi', 'Pesanan sudah siap diambil', 'Maaf menu ini habis'];
    return ['Saya dalam perjalanan', 'Sudah sampai depan rumah', 'Pekerjaan selesai'];
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col md:flex-row gap-4">
      {(!selectedChat || window.innerWidth >= 768) && (
        <Card className="p-0 w-full md:w-1/3 flex flex-col h-full border-none">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700">
            <h1 className="text-xl font-bold">Pesan</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeChats.map(c => (
              <div key={c.id} onClick={() => setSelectedChat(c)} className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedChat?.id === c.id ? 'bg-primary/5' : ''}`}>
                <div className="flex justify-between mb-1">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-xs text-slate-500">{c.time}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-slate-500 truncate">{c.lastMessage}</p>
                  {c.unread > 0 && <span className="bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{c.unread}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(selectedChat || window.innerWidth >= 768) && (
        <div className={`flex-1 h-full ${!selectedChat ? 'hidden md:flex flex-col items-center justify-center text-slate-400' : ''}`}>
          {selectedChat ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <button className="md:hidden p-2 text-primary" onClick={() => setSelectedChat(null)}>&larr; Kembali</button>
                <h2 className="text-lg font-bold">{selectedChat.name}</h2>
              </div>
              <ChatInterface messages={chatMessages} quickReplies={getQuickReplies()} />
            </div>
          ) : (
            <p>Pilih obrolan untuk mulai membalas.</p>
          )}
        </div>
      )}
    </div>
  );
};
export default ChatPage;
