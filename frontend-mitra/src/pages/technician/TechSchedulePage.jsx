import React from 'react';
import { Card, Badge } from '../../components/shared/UIComponents';
import { techSchedule } from '../../data/schedule';

const TechSchedulePage = () => (
  <div className="space-y-6">
    <h1 className="text-2xl font-bold">Jadwal Kalender</h1>
    {/* Simplified Calendar View for UI showcase */}
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <button className="font-bold text-xl">&lt;</button>
        <span className="font-bold">Agustus 2026</span>
        <button className="font-bold text-xl">&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-slate-500 mb-2">
        <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {[...Array(31)].map((_, i) => (
          <div key={i} className={`p-2 rounded-full w-8 h-8 mx-auto flex items-center justify-center ${i===14 ? 'bg-primary text-white font-bold' : (i===16||i===20 ? 'bg-secondary/20 font-bold' : '')}`}>
            {i + 1}
          </div>
        ))}
      </div>
    </Card>

    <div>
      <h2 className="text-lg font-bold mb-3">Agenda (15 Agu)</h2>
      <div className="space-y-3">
        {techSchedule.map(s => (
          <Card key={s.id} className="p-3 flex gap-3 items-center border-l-4 border-l-primary">
            <span className="font-bold w-12 text-center text-slate-600">{s.time}</span>
            <div className="flex-1">
              <p className="font-semibold">{s.task}</p>
              <p className="text-xs text-slate-500">{s.address}</p>
            </div>
            <Badge variant="gray">{s.status}</Badge>
          </Card>
        ))}
      </div>
    </div>
  </div>
);
export default TechSchedulePage;
