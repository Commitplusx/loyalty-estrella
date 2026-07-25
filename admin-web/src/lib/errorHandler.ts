import { toast } from 'sonner';

export const handleDbError = (error: any, defaultMessage: string = 'Ocurrió un error inesperado') => {
  console.error("Database Error:", error);

  let message = defaultMessage;

  if (error?.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes('relation') && msg.includes('does not exist')) {
      message = 'La tabla solicitada no existe en la base de datos.';
    } else if (msg.includes('duplicate key')) {
      message = 'Este registro ya existe (duplicado).';
    } else if (msg.includes('foreign key constraint')) {
      message = 'No se puede eliminar porque tiene datos vinculados.';
    } else if (msg.includes('permission denied')) {
      message = 'No tienes permiso para realizar esta acción.';
    } else if (msg.includes('fetch') || msg.includes('network')) {
      message = 'Error de conexión. Revisa tu internet.';
    }
  }

  toast.error(message, {
    description: 'Nuestros ingenieros ya fueron notificados.',
  });
};
