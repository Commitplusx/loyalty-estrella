export const UBER_EATS_MAP_STYLE = [
  // Ocultar estaciones de transporte
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  // Paisaje gris limpio y elegante
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f4f4f4' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#f4f4f4' }] },
  { featureType: 'landscape.natural', elementType: 'geometry.fill', stylers: [{ color: '#e8ece9' }] },
  // Calles blancas puras, limpias sin bordes
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }, { weight: 1 }] },
  // Simplificar textos de las calles, ocultar calles muy pequeñas
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  // Agua estilo elegante
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#cdd2d4' }] },
  // Textos y nombres de calles más suaves
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
];
