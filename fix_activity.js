const fs = require('fs');

const path = 'frontend-user/src/pages/ActivityPage.jsx';
let content = fs.readFileSync(path, 'utf8');

const reviewButtonReplacement = `
            </div>

            {selectedOrder.rawStatus === 'completed' && !selectedOrder.is_reviewed && selectedOrder.driver_name && (
              <Button
                className="w-full py-2.5 font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  setReviewingOrder(selectedOrder);
                  setSelectedOrder(null);
                }}
              >
                ⭐ Beri Ulasan & Tip
              </Button>
            )}

            <Button
              className="w-full py-2.5 font-bold text-xs"
              onClick={() => setSelectedOrder(null)}
`;
content = content.replace(`            </div>\n\n            <Button\n              className="w-full py-2.5 font-bold text-xs"\n              onClick={() => setSelectedOrder(null)}`, reviewButtonReplacement);

const reviewModalReplacement = `
        </div>
      )}

      {reviewingOrder && (
        <ReviewModal 
          order={reviewingOrder} 
          onClose={() => setReviewingOrder(null)}
          onSuccess={() => {
            // Optimistically update order context is ideal, 
            // but for now it'll fetch again on next mount/socket
            setReviewingOrder(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
`;
content = content.replace(`        </div>\n      )}\n    </div>\n  );\n}`, reviewModalReplacement);

fs.writeFileSync(path, content);
