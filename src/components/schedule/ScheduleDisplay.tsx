import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, Sparkles, MapPin } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';

export function ScheduleDisplay() {
  const { storeState, horarios, horasFelices, formatTime } = useSchedule();

  const getDiaActual = () => {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[new Date().getDay()];
  };

  return (
    <div className="space-y-4">
      {/* Estado actual */}
      <Card className={`border-0 shadow-lg overflow-hidden ${
        storeState.isOpen 
          ? storeState.isHappyHour 
            ? 'bg-gradient-to-br from-amber-500 to-orange-500' 
            : 'bg-gradient-to-br from-green-500 to-emerald-500'
          : 'bg-gradient-to-br from-gray-500 to-gray-600'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                storeState.isOpen 
                  ? storeState.isHappyHour 
                    ? 'bg-white/20' 
                    : 'bg-white/20' 
                  : 'bg-white/10'
              }`}>
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-lg">
                    {storeState.isOpen ? 'Abierto' : 'Cerrado'}
                  </h3>
                  {storeState.isHappyHour && (
                    <Badge className="bg-white text-amber-600 font-bold">
                      <Sparkles className="w-3 h-3 mr-1" />
                      HORA FELIZ
                    </Badge>
                  )}
                </div>
                <p className="text-white/80 text-sm">
                  {storeState.message}
                </p>
              </div>
            </div>
            
            {storeState.isHappyHour && (
              <div className="text-right">
                <p className="text-white/80 text-xs">Precio especial</p>
                <p className="text-white font-bold text-2xl">$35</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Horario de atención */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-gray-900">Horario de Atención</h3>
          </div>
          
          <div className="space-y-2">
            {horarios.map((horario) => {
              const isToday = horario.nombre === getDiaActual();
              return (
                <div 
                  key={horario.dia}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    isToday ? 'bg-orange-50 border border-orange-200' : ''
                  }`}
                >
                  <span className={`font-medium ${isToday ? 'text-orange-700' : 'text-gray-700'}`}>
                    {horario.nombre}
                    {isToday && <span className="ml-2 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">Hoy</span>}
                  </span>
                  <span className={`text-sm ${isToday ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                    {formatTime(horario.hora_apertura)} - {formatTime(horario.hora_cierre)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Horas felices */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-gray-900">Horas Felices</h3>
            <Badge variant="secondary" className="bg-amber-200 text-amber-800">
              $35 envío
            </Badge>
          </div>
          
          <div className="space-y-3">
            {horasFelices.filter(h => h.activo).map((hora) => {
              const isToday = hora.nombre === getDiaActual();
              const isActive = isToday && storeState.isHappyHour;
              
              return (
                <div 
                  key={hora.dia}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    isActive 
                      ? 'bg-amber-500 text-white shadow-lg' 
                      : isToday 
                        ? 'bg-white border-2 border-amber-300' 
                        : 'bg-white/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-white/20' : 'bg-amber-100'
                    }`}>
                      <Clock className={`w-5 h-5 ${isActive ? 'text-white' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <p className={`font-semibold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                        {hora.nombre}
                      </p>
                      <p className={`text-sm ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                        {formatTime(hora.hora_inicio)} - {formatTime(hora.hora_fin)}
                      </p>
                    </div>
                  </div>
                  
                  {isActive && (
                    <Badge className="bg-white text-amber-600">
                      AHORA
                    </Badge>
                  )}
                  {isToday && !isActive && (
                    <Badge variant="outline" className="border-amber-300 text-amber-600">
                      HOY
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 p-3 bg-white/80 rounded-lg">
            <p className="text-sm text-gray-600 text-center">
              <strong className="text-amber-600">¡Aprovecha!</strong> Durante la hora feliz, 
              todos los envíos cuestan solo <strong className="text-amber-600">$35</strong>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cobertura */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Cobertura Total</p>
              <p className="text-sm text-gray-500">Toda la ciudad</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
