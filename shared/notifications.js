// Shared notification system for all pages
// This prevents duplicate notification implementations across different files

class NotificationManager {
    constructor() {
        this.activeNotifications = new Set();
        this.maxNotifications = 3;
        this.ensureStyles();
    }

    ensureStyles() {
        if (document.getElementById('notification-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.innerHTML = `
            .yappr-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                z-index: 10000;
                opacity: 0;
                transform: translateX(100px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                max-width: 400px;
                word-wrap: break-word;
            }

            .yappr-notification.show {
                opacity: 1;
                transform: translateX(0);
            }

            .yappr-notification.success {
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
            }

            .yappr-notification.error {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }

            .yappr-notification.warning {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white;
            }

            .yappr-notification.info {
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
            }

            @keyframes yappr-notification-stack {
                from { transform: translateY(0); }
                to { transform: translateY(-60px); }
            }
        `;
        document.head.appendChild(style);
    }

    show(message, type = 'success', duration = 3000) {
        // Remove oldest notification if we have too many
        if (this.activeNotifications.size >= this.maxNotifications) {
            const oldest = Array.from(this.activeNotifications)[0];
            this.hide(oldest);
        }

        const notification = document.createElement('div');
        notification.className = `yappr-notification ${type}`;
        notification.textContent = message;

        // Position based on existing notifications
        const offset = this.activeNotifications.size * 60;
        notification.style.top = `${20 + offset}px`;

        document.body.appendChild(notification);
        this.activeNotifications.add(notification);

        // Show notification
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto-hide after duration
        setTimeout(() => {
            this.hide(notification);
        }, duration);

        return notification;
    }

    hide(notification) {
        if (!notification || !this.activeNotifications.has(notification)) return;

        notification.classList.remove('show');
        this.activeNotifications.delete(notification);

        // Animate remaining notifications down
        const remainingNotifications = Array.from(this.activeNotifications);
        remainingNotifications.forEach((notif, index) => {
            notif.style.top = `${20 + index * 60}px`;
        });

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    clear() {
        this.activeNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        this.activeNotifications.clear();
    }
}

// Create global instance
window.NotificationManager = window.NotificationManager || new NotificationManager();

// Global function for backward compatibility
function showToast(message, type = 'success', duration = 3000) {
    return window.NotificationManager.show(message, type, duration);
}