import { writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Только для разработки: панель визуала (F2) сохраняет src/visual.json через POST /__save-visual.
// Правка файла не перезагружает страницу (handleHotUpdate глушит обновление),
// но кэш модуля сбрасывается, и следующая перезагрузка читает свежий JSON.
export default defineConfig({
  plugins: [
    {
      name: 'save-visual',
      handleHotUpdate({ file }) {
        if (file.endsWith('src/visual.json')) return [];
      },
      configureServer(server) {
        server.middlewares.use('/__save-visual', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              writeFileSync('src/visual.json', JSON.stringify(JSON.parse(body), null, 2) + '\n');
              res.end('ok');
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
        });
      },
    },
  ],
});
