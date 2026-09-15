package app.basechan_funder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import android.util.Log
import java.util.regex.Pattern

class BankSmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            for (sms in messages) {
                val sender = sms.displayOriginatingAddress ?: ""
                val body = sms.displayMessageBody ?: ""
                val timestamp = sms.timestampMillis

                Log.d("BankSmsReceiver", "Incoming SMS from $sender: $body")

                val bankName = identifyBank(sender)
                if (bankName != null) {
                    parseBankBalance(bankName, body, timestamp)
                }
            }
        }
    }

    private fun identifyBank(sender: String): String? {
        return when {
            sender.contains("UBA", true) || sender.contains("UBALERT", true) || 
            sender.contains("UBA-ALERT", true) || sender.contains("UBADIRECT", true) ||
            sender.contains("UBAGroup", true) -> "United Bank for Africa (UBA)"
            sender.contains("GTBank", true) || sender.contains("GTB", true) -> "Guaranty Trust Bank (GTB)"
            sender.contains("Access", true) -> "Access Bank"
            sender.contains("Zenith", true) -> "Zenith Bank"
            sender.contains("FirstBank", true) || sender.contains("FBN", true) -> "First Bank of Nigeria"
            sender.contains("Parallex", true) -> "Parallex Bank"
            sender.contains("Kuda", true) -> "Kuda MFB"
            else -> null
        }
    }

    private fun parseBankBalance(bankName: String, body: String, timestamp: Long) {
        // Enhanced regex to handle multiple variations of Nigerian bank alerts
        // Matches: "Bal: 1,000.00", "Amt: 500.00 CR Bal: 1,500.00", "Avail Bal: NGN 20,000.00"
        val balancePattern = Pattern.compile("(?:Bal|Balance|Avail\\s+Bal|Ledger\\s+Bal|New\\s+Bal)(?:\\s*:|\\s+is|\\s*-)?\\s*(?:NGN|₦|#)?\\s*([0-9,]+\\.[0-9]{2})", Pattern.CASE_INSENSITIVE)
        
        // Broad pattern to capture account mask (last 4 digits)
        val acctPattern = Pattern.compile("(?:Acct|Ac|Acc|A/c|Account)\\s*[:\\s]*[\\w\\.\\*]*(\\d{4})", Pattern.CASE_INSENSITIVE)
        
        val balMatcher = balancePattern.matcher(body)
        val acctMatcher = acctPattern.matcher(body)

        if (balMatcher.find()) {
            val balanceStr = balMatcher.group(1) ?: ""
            val cleanBalance = balanceStr.replace(",", "")
            val balance = cleanBalance.toDoubleOrNull()
            
            val mask = if (acctMatcher.find()) acctMatcher.group(1) ?: "XXXX" else "XXXX"

            if (balance != null) {
                Log.i("BankSmsReceiver", "Extracted $bankName Balance: $balance for account $mask")
                
                // 1. Update UI via JS Bridge (BaaS Mode)
                // The web app handles the Firestore sync locally.
                MainActivity.instance?.updateSmsBalance(balance, mask, timestamp)
            }
        }
    }
}
