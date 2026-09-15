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
        val s = sender.uppercase()
        return when {
            s.contains("UBA") || s.contains("UBALERT") || 
            s.contains("UBA-ALERT") || s.contains("UBADIRECT") ||
            s.contains("UBAGROUP") || s.contains("UBA_DIRECT") -> "United Bank for Africa (UBA)"
            s.contains("GTBANK") || s.contains("GTB") || s.contains("GTBANK-PLC") -> "Guaranty Trust Bank (GTB)"
            s.contains("ACCESS") || s.contains("ACCESS-BANK") -> "Access Bank"
            s.contains("ZENITH") || s.contains("ZENITHBANK") -> "Zenith Bank"
            s.contains("FIRSTBANK") || s.contains("FBN") || s.contains("FBN_MOBILE") -> "First Bank of Nigeria"
            s.contains("PARALLEX") || s.contains("PARALLEXBANK") -> "Parallex Bank"
            s.contains("KUDA") || s.contains("KUDABANK") -> "Kuda MFB"
            s.contains("OPAY") || s.contains("BLUE RIDGE") -> "Opay (Blue Ridge MFB)"
            s.contains("PALMPAY") -> "PalmPay"
            s.contains("MONIEPOINT") -> "Moniepoint MFB"
            else -> null
        }
    }

    private fun parseBankBalance(bankName: String, body: String, timestamp: Long) {
        // Enhanced regex to handle multiple variations of Nigerian bank alerts
        // Matches: "Bal: 1,000.00", "Amt: 500.00 CR Bal: 1,500.00", "Avail Bal: NGN 20,000.00"
        val balancePattern = Pattern.compile("(?:Bal|Balance|Avail\\s+Bal|Ledger\\s+Bal|New\\s+Bal)(?:\\s*:|\\s+is|\\s*-|\\s*)?\\s*(?:NGN|₦|#|N)?\\s*([0-9,]+\\.[0-9]{2})", Pattern.CASE_INSENSITIVE)
        
        // Broad pattern to capture account mask (last 4 digits)
        val acctPattern = Pattern.compile("(?:Acct|Ac|Acc|A/c|Account|No)\\s*[:\\s]*[\\w\\.\\*-]*(\\d{4})", Pattern.CASE_INSENSITIVE)
        
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
                MainActivity.instance?.updateSmsBalance(balance, mask, timestamp)
            } else {
                Log.w("BankSmsReceiver", "Identified $bankName alert but failed to parse numeric balance from: $balanceStr")
            }
        } else {
            Log.w("BankSmsReceiver", "Identified $bankName alert but no balance found in body: $body")
        }
    }
}
