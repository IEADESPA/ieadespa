import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // expõe o servidor na rede local, para testar em outro dispositivo (ex.: celular) via Wi-Fi
    host: true,
  },
})
