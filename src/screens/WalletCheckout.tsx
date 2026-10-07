import { Alert } from '../components/AppAlert';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '../components/Text';
import { verifyWalletPayment, type WalletPaymentOrder } from '../api';
import { scale, fontScale } from '../theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export function checkoutHtml(order: WalletPaymentOrder) {
  const options = JSON.stringify({
    key: order.key_id, order_id: order.order_id,
    amount: Math.round(order.amount * 100), currency: order.currency,
    name: 'UGCad', description: 'Add funds to wallet',
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body><script>
function send(type, data) { window.ReactNativeWebView.postMessage(JSON.stringify({type:type,data:data})); }
</script><script src="https://checkout.razorpay.com/v1/checkout.js" onerror="send('error')"></script>
<script>
try {
  var options = ${options};
  options.handler = function(result) { send('success', result); };
  options.modal = { ondismiss: function() { send('cancel'); } };
  var checkout = new Razorpay(options);
  checkout.on('payment.failed', function() { send('error'); });
  checkout.open();
} catch(e) { send('error'); }
</script></body></html>`;
}

export default function WalletCheckout({ token, order, onClose, onSuccess }: {
  token: string; order: WalletPaymentOrder; onClose: () => void; onSuccess: () => void;
}) {
  const html = useMemo(() => checkoutHtml(order), [order]);
  const verifying = useRef(false);
  const [busy, setBusy] = useState(false);
  const close = () => { if (!verifying.current) onClose(); };
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Add funds · Payment</Text>
          <TouchableOpacity onPress={close} disabled={busy} accessibilityRole="button">
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html, baseUrl: 'https://www.ugcad.io' }}
          originWhitelist={['https://*', 'about:*']}
          javaScriptEnabled
          onShouldStartLoadWithRequest={request => {
            if (/^(https?:|about:)/i.test(request.url)) return true;
            Linking.openURL(request.url).catch(() => Alert.alert('Unable to open payment app', 'Choose another payment method.'));
            return false;
          }}
          onError={() => Alert.alert('Payment could not load', 'Close and try again.')}
          onMessage={async event => {
            if (verifying.current) return;
            let message;
            try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
            if (message.type === 'cancel') { close(); return; }
            if (message.type === 'error') {
              Alert.alert('Payment not completed', 'Try another payment method or close to return to your wallet.');
              return;
            }
            const result = message.data;
            if (message.type !== 'success' || result?.razorpay_order_id !== order.order_id ||
                !result?.razorpay_payment_id || !result?.razorpay_signature) return;
            verifying.current = true;
            setBusy(true);
            try {
              const response = await verifyWalletPayment(token, result);
              if (!response.success) throw new Error('Payment verification is pending.');
              onSuccess();
            } catch {
              Alert.alert('Payment verification pending', 'Return to your wallet and refresh the balance before trying another payment.');
              onClose();
            } finally {
              verifying.current = false;
              setBusy(false);
            }
          }}
        />
        {busy && <View style={styles.verifying}><ActivityIndicator /><Text>Verifying payment…</Text></View>}
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { padding: scale(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontScale(16), fontFamily: 'ReadexPro-SemiBold', fontWeight: '600', color: '#15163F' },
  close: { fontSize: fontScale(14), fontFamily: 'Inter-SemiBold', fontWeight: '600', color: '#4C4DD6' },
  verifying: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: scale(12) },
});
