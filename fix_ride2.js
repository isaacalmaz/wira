const fs = require('fs');

function cleanFile(file, arrName) {
  let content = fs.readFileSync(file, 'utf8');
  // I'll manually clean it up by replacing the whole thing.
  // Actually, I'll just use a robust replace
  const matchStr = `// Dispatch is handled dynamically in ActiveOrderPage via Sequential Ping.
              },
              body: JSON.stringify({
                userId: d.id,
                title: 'Pesanan WiraRide Baru!',
                body: \`Ada penumpang di dekat Anda menuju \${dropoff}.\`,
                data: { orderId: order.id, type: 'new_ride_order' },
              }),
            }).catch((err) => console.error('order-alert (nearby driver) failed:', err));
          });
        });
      }`;
  content = content.replace(matchStr, '// Dispatch is handled dynamically in ActiveOrderPage via Sequential Ping.');
  fs.writeFileSync(file, content);
}
// Oh wait, SendPage has a different title! PoolPage too!
// I'll just delete lines matching .catch((err) => ... until }
