// Mock Data untuk Restoran
export const RESTAURANTS = [
  {
    id: 1,
    name: "Warung Ayam Taliwang Mas Bos",
    category: "Ayam",
    image: "https://via.placeholder.com/150",
    rating: 4.8,
    deliveryTime: "20-35 min",
    minOrder: 20000,
    address: "Jl. Pejanggik No. 10, Mataram",
    lat: -8.5833,
    lng: 116.1167,
    isOpen: true,
    menuItems: [
      { id: 101, name: "Ayam Taliwang Bakar", price: 45000, description: "Ayam bakar khas Lombok pedas manis" },
      { id: 102, name: "Plecing Kangkung", price: 15000, description: "Kangkung rebus dengan sambal tomat pedas" }
    ]
  },
  {
    id: 2,
    name: "Sate Rembiga Pak Haji",
    category: "Daging",
    image: "https://via.placeholder.com/150",
    rating: 4.7,
    deliveryTime: "15-30 min",
    minOrder: 25000,
    address: "Jl. Rembiga, Mataram",
    lat: -8.5780,
    lng: 116.1050,
    isOpen: true,
    menuItems: [
      { id: 201, name: "Sate Rembiga Sapi", price: 30000, description: "Sate sapi bumbu pedas manis porsi 10 tusuk" },
      { id: 202, name: "Nasi Putih", price: 5000, description: "Nasi putih hangat" }
    ]
  }
];
