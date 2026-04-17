import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import { Copy, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../utils/axiosConfig';

const QRCodeModal = ({ isOpen, onClose, patient }) => {
  const [qrLink, setQrLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState(15);
  const [loadingLink, setLoadingLink] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const generateQrLink = useCallback(async () => {
    if (!patient?._id) return;

    try {
      setLoadingLink(true);
      setErrorMessage('');

      const { data } = await api.post(`/qr-share/patients/${patient._id}/link`);

      setQrLink(data.shareUrl || '');
      setExpiresAt(data.expiresAt || '');
      setTtlMinutes(data.ttlMinutes || 15);
    } catch (error) {
      setQrLink('');
      setExpiresAt('');
      setErrorMessage(error.response?.data?.message || 'Unable to generate secure QR link. Please try again.');
    } finally {
      setLoadingLink(false);
    }
  }, [patient?._id]);

  useEffect(() => {
    if (!isOpen || !patient?._id) {
      return;
    }

    generateQrLink();
  }, [generateQrLink, isOpen, patient?._id]);

  useEffect(() => {
    if (!isOpen) {
      setQrLink('');
      setExpiresAt('');
      setErrorMessage('');
      setLoadingLink(false);
    }
  }, [isOpen]);

  const handleCopyLink = async () => {
    if (!qrLink) return;

    try {
      await navigator.clipboard.writeText(qrLink);
      toast.success('Secure QR link copied');
    } catch (error) {
      toast.error('Could not copy link. Please copy manually.');
    }
  };

  if (!isOpen || !patient) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="ui-modal-surface p-8 w-full max-w-sm relative text-center"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <X size={24} />
          </button>

          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Patient ID
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            {patient.firstName} {patient.lastName}
          </p>

          {loadingLink && (
            <div className="bg-white p-6 rounded-xl border-2 border-slate-100 min-w-[232px] min-h-[232px] flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-cyan-500 animate-spin" />
              <p className="text-sm text-slate-500">Generating secure QR link...</p>
            </div>
          )}

          {!loadingLink && errorMessage && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-left">
              <p className="text-sm text-red-700">{errorMessage}</p>
              <button
                onClick={generateQrLink}
                className="mt-3 px-3 py-2 text-sm rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 transition-colors inline-flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Retry
              </button>
            </div>
          )}

          {!loadingLink && !errorMessage && qrLink && (
            <>
              <div className="bg-white p-4 rounded-xl border-2 border-slate-100 inline-block">
                <QRCode value={qrLink} size={200} level="H" />
              </div>

              <div className="mt-4 text-left space-y-3">
                <p className="text-xs text-slate-500 break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  {qrLink}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-2 text-sm rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-2"
                  >
                    <Copy size={16} />
                    Copy Link
                  </button>
                  <button
                    onClick={generateQrLink}
                    className="px-3 py-2 text-sm rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 hover:bg-cyan-100 transition-colors inline-flex items-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Regenerate
                  </button>
                </div>

                <p className="text-xs text-amber-600">
                  Single-use secure link • expires in {ttlMinutes} minutes
                  {expiresAt && ` (${new Date(expiresAt).toLocaleTimeString()})`}
                </p>
              </div>
            </>
          )}

          <p className="mt-6 text-sm text-slate-400 dark:text-slate-500">
            Scan this code to open patient details with token-based access.
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default QRCodeModal;
