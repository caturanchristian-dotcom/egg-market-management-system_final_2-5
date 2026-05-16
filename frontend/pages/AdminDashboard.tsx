import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { User, Order, Product } from '../types';
import { 
  Users, 
  ShoppingBag, 
  TrendingUp, 
  ShieldCheck, 
  UserCheck, 
  UserX, 
  MoreVertical,
  BarChart3,
  Package,
  ClipboardList,
  Plus,
  XCircle,
  Trash2,
  Tags,
  Edit2,
  Save,
  MessageSquare,
  PieChart as PieChartIcon,
  Star,
  MapPin,
  ChevronRight,
  X,
  Eye,
  EyeOff,
  FileText
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { Category } from '../types';
import MessagingSystem from '../components/MessagingSystem';
import ConfirmationModal from '../components/ConfirmationModal';
import { EGG_PLACEHOLDER } from '../constants';

/**
 * AdminDashboard Component
 * The central control tower for platform administrators.
 * Provides data visualization, user moderation, product monitoring, and analytical reporting.
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { showToast } = useNotifications();
  
  // Navigation and data states
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<any>(null); // High-level aggregate metrics
  const [users, setUsers] = useState<User[]>([]); // Full platform user list for moderation
  const [products, setProducts] = useState<Product[]>([]); // Global catalog
  const [orders, setOrders] = useState<Order[]>([]); // Global order log
  const [reports, setReports] = useState<any[]>([]); // Monthly revenue history
  const [categoryReports, setCategoryReports] = useState<any[]>([]); // Performance by category
  const [farmerReports, setFarmerReports] = useState<any[]>([]); // Top performing suppliers
  const [activity, setActivity] = useState<any[]>([]); // Recent platform interactions
  const [settings, setSettings] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'customer'
  });
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'user' | 'category' | 'product' | 'order' | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<User | null>(null);
  const [farmerDetails, setFarmerDetails] = useState<{
    products: Product[],
    sales: any[],
    reviews: any[],
    stats: any
  } | null>(null);
  const [loadingFarmerDetails, setLoadingFarmerDetails] = useState(false);

  /**
   * Data Refresh Trigger
   */
  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const showNotify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    showToast(message, type);
  };

  /**
   * Fetches specific breakdown of an order's items
   */
  const fetchOrderItems = async (orderId: number) => {
    setOrderItems([]);
    try {
      const res = await fetch(`/api/orders/${orderId}/items`);
      if (res.ok) {
        const data = await res.json();
        setOrderItems(data);
      }
    } catch (err) {
      console.error('Error fetching order items:', err);
    }
  };

  /**
   * Fetches deep metrics for a single farmer (Supply audit)
   */
  const fetchFarmerDetails = async (farmer: User) => {
    setSelectedFarmer(farmer);
    setFarmerDetails(null);
    setLoadingFarmerDetails(true);
    try {
      const [productsRes, salesRes, reviewsRes, statsRes] = await Promise.all([
        fetch(`/api/products`),
        fetch(`/api/farmer/${farmer.id}/sales-stats`),
        fetch(`/api/farmers/${farmer.id}/reviews`),
        fetch(`/api/farmers/${farmer.id}/rating`)
      ]);
      
      const allProducts = await productsRes.json();
      const farmerProducts = allProducts.filter((p: Product) => p.farmer_id === farmer.id);
      
      setFarmerDetails({
        products: farmerProducts,
        sales: await salesRes.json(),
        reviews: await reviewsRes.json(),
        stats: await statsRes.json()
      });
    } catch (err) {
      console.error('Error fetching farmer details:', err);
    } finally {
      setLoadingFarmerDetails(false);
    }
  };

  /**
   * Orchestrates massive parallel data retrieval for the admin dashboard
   */
  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [statsRes, usersRes, productsRes, ordersRes, reportsRes, settingsRes, categoriesRes, catReportsRes, farmerReportsRes, activityRes] = await Promise.all([
        fetch(`/api/admin/stats${queryStr}`),
        fetch('/api/admin/users'),
        fetch('/api/products'),
        fetch(`/api/admin/orders${queryStr}`),
        fetch(`/api/admin/reports/sales${queryStr}`),
        fetch('/api/settings'),
        fetch('/api/categories'),
        fetch('/api/admin/reports/categories'),
        fetch('/api/admin/reports/farmers'),
        fetch('/api/admin/activity')
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());
      if (activityRes.ok) setActivity(await activityRes.json());
      
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
        setSettingsForm(settingsData);
      }
      
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (catReportsRes.ok) setCategoryReports(await catReportsRes.json());
      if (farmerReportsRes.ok) setFarmerReports(await farmerReportsRes.json());
      
      fetchPendingVerifications();
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles creation and profile editing of platform users
   */
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
    const method = editingUser ? 'PUT' : 'POST';
    
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (response.ok) {
        setShowAddModal(false);
        setEditingUser(null);
        setFormData({ name: '', email: '', password: '', role: 'customer' });
        fetchData();
      } else {
        setError(data.error || 'Failed to save user');
      }
    } catch (err) {
      setError('An error occurred');
    }
  };

  /**
   * Moderation helper: Approves or suspends user access
   */
  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/admin/users/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchData();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleDeleteUser = async (e: React.MouseEvent | any, id: number) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setItemToDelete(id);
    setDeleteType('user');
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !deleteType) return;
    
    let url = '';
    if (deleteType === 'user') url = `/api/admin/users/${itemToDelete}`;
    else if (deleteType === 'category') url = `/api/admin/categories/${itemToDelete}`;
    else if (deleteType === 'product') url = `/api/products/${itemToDelete}`;
    else if (deleteType === 'order') url = `/api/orders/${itemToDelete}`;

    try {
      const response = await fetch(url, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        fetchData();
        showNotify(`${deleteType.charAt(0).toUpperCase()}${deleteType.slice(1)} deleted successfully!`, 'success');
        setShowDeleteConfirm(false);
        setItemToDelete(null);
        setDeleteType(null);
        if (deleteType === 'order') setSelectedOrder(null);
      } else {
        showNotify(data.error || `Failed to delete ${deleteType}`, 'error');
      }
    } catch (err) {
      console.error(`Error deleting ${deleteType}:`, err);
      showNotify(`An error occurred while deleting the ${deleteType}`, 'error');
    }
  };

  /**
   * Triggers the deletion workflow for a product
   */
  const handleDeleteProduct = (e: React.MouseEvent | any, id: number) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setItemToDelete(id);
    setDeleteType('product');
    setShowDeleteConfirm(true);
  };

  /**
   * Triggers the deletion workflow for an order
   */
  const handleDeleteOrder = (e: React.MouseEvent | any, orderId: number) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setItemToDelete(orderId);
    setDeleteType('order');
    setShowDeleteConfirm(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const url = editingCategory ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories';
    const method = editingCategory ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryName })
      });
      const data = await response.json();
      if (response.ok) {
        setShowCategoryModal(false);
        setEditingCategory(null);
        setCategoryName('');
        fetchData();
      } else {
        setError(data.error || 'Failed to save category');
      }
    } catch (err) {
      setError('An error occurred');
    }
  };

  const handleDeleteCategory = async (e: React.MouseEvent | any, id: number) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setItemToDelete(id);
    setDeleteType('category');
    setShowDeleteConfirm(true);
  };

  const renderCategories = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-emerald-900">Category Management</h2>
        <button 
          onClick={() => {
            setEditingCategory(null);
            setCategoryName('');
            setShowCategoryModal(true);
          }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map(category => (
          <motion.div 
            key={category.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex justify-between items-center"
          >
            <div>
              <h3 className="font-bold text-emerald-900">{category.name}</h3>
              <p className="text-xs text-emerald-500">
                {products.filter(p => p.category_id === category.id).length} Products
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setEditingCategory(category);
                  setCategoryName(category.name);
                  setShowCategoryModal(true);
                }}
                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
              >
                <Edit2 size={18} />
              </button>
              <button 
                onClick={(e) => handleDeleteCategory(e, category.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderOverview = () => {
    const getActivityIcon = (type: string) => {
      switch (type) {
        case 'user_signup': return <Users size={16} className="text-blue-600" />;
        case 'order_placed': return <ShoppingBag size={16} className="text-emerald-600" />;
        case 'product_added': return <Package size={16} className="text-purple-600" />;
        case 'farmer_verified': return <ShieldCheck size={16} className="text-orange-600" />;
        default: return <ClipboardList size={16} />;
      }
    };

    const getActivityLabel = (type: string) => {
      switch (type) {
        case 'user_signup': return 'New Member';
        case 'order_placed': return 'New Order';
        case 'product_added': return 'New Product';
        case 'farmer_verified': return 'Farmer Verified';
        default: return 'Activity';
      }
    };

    const getRelativeTime = (dateStr: string) => {
      const now = new Date();
      const past = new Date(dateStr);
      const diffInMs = now.getTime() - past.getTime();
      const diffInMin = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMin / 60);
      const diffInDays = Math.floor(diffInHours / 24);

      if (diffInMin < 1) return 'just now';
      if (diffInMin < 60) return `${diffInMin}m ago`;
      if (diffInHours < 24) return `${diffInHours}h ago`;
      return `${diffInDays}d ago`;
    };

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'emerald' },
            { label: 'Active Farmers', value: stats?.totalFarmers || 0, icon: UserCheck, color: 'blue' },
            { label: 'Total Orders', value: stats?.totalOrders || 0, icon: ShoppingBag, color: 'purple' },
            { label: 'Total Revenue', value: `₱${(Number(stats?.totalRevenue) || 0).toFixed(2)}`, icon: TrendingUp, color: 'orange' },
          ].map((stat, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={stat.label} 
              className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm"
            >
              <div className={`w-12 h-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-600 mb-4`}>
                <stat.icon size={24} />
              </div>
              <p className="text-emerald-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-emerald-900 mt-1">{stat.value}</h3>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Enhanced Platform Activity Feed */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden h-[500px] flex flex-col">
            <div className="p-8 border-b border-emerald-50 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-bold text-emerald-900 text-lg">Platform Activity</h3>
                <p className="text-xs text-emerald-500 mt-1">Real-time chronicle of interactions</p>
              </div>
              <button 
                onClick={fetchData} 
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl transition-all"
              >
                Refresh Log
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-6">
              {activity.length > 0 ? (
                activity.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex gap-4 group"
                  >
                    <div className="relative flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110 ${
                        item.type === 'user_signup' ? 'bg-blue-50' : 
                        item.type === 'order_placed' ? 'bg-emerald-50' : 
                        item.type === 'product_added' ? 'bg-purple-50' : 'bg-orange-50'
                      }`}>
                        {getActivityIcon(item.type)}
                      </div>
                      {idx !== activity.length - 1 && (
                        <div className="w-0.5 flex-1 bg-emerald-50 my-1" />
                      )}
                    </div>
                    
                    <div className="flex-1 pb-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">
                            {getActivityLabel(item.type)}
                          </p>
                          <h4 className="text-sm font-bold text-emerald-900 group-hover:text-emerald-600 transition-colors">
                            {item.message}
                          </h4>
                          <p className="text-xs text-emerald-500/70 mt-1 line-clamp-1">
                            {item.type === 'user_signup' && `Joined as ${item.meta}`}
                            {item.type === 'order_placed' && `Transaction value: ₱${Number(item.meta).toFixed(2)}`}
                            {item.type === 'product_added' && `Listed at ₱${Number(item.meta).toFixed(2)}/tray`}
                            {item.type === 'farmer_verified' && `Status: ${item.meta}`}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium text-emerald-300 whitespace-nowrap bg-emerald-50/50 px-2 py-0.5 rounded-full">
                          {getRelativeTime(item.created_at)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <ClipboardList size={48} className="text-emerald-200" />
                  <p className="text-sm font-medium text-emerald-900">No recent activity detected</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-emerald-900 rounded-3xl p-8 text-white flex flex-col justify-between shadow-xl shadow-emerald-200 relative overflow-hidden h-[500px]">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full translate-x-32 -translate-y-32 -z-0 opacity-50" />
            
            <div className="relative z-10">
              <ShieldCheck size={40} className="text-emerald-400 mb-6" />
              <h3 className="text-2xl font-bold mb-2">System Health</h3>
              <p className="text-emerald-300 text-sm">All systems are operational. No pending security alerts.</p>
              
              <div className="mt-12 space-y-6">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                   <div className="flex justify-between items-center mb-3">
                     <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Database Engine</span>
                     <span className="text-xs font-black">STABLE</span>
                   </div>
                   <div className="w-full bg-emerald-950 h-1.5 rounded-full overflow-hidden">
                     <div className="bg-emerald-400 h-full w-[99.9%]" />
                   </div>
                </div>

                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                   <div className="flex justify-between items-center mb-3">
                     <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Server Capacity</span>
                     <span className="text-xs font-black">12% USE</span>
                   </div>
                   <div className="w-full bg-emerald-950 h-1.5 rounded-full overflow-hidden">
                     <div className="bg-emerald-400 h-full w-[12%]" />
                   </div>
                </div>

                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                   <div className="flex justify-between items-center mb-3">
                     <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">API Latency</span>
                     <span className="text-xs font-black">24ms</span>
                   </div>
                   <div className="w-full bg-emerald-950 h-1.5 rounded-full overflow-hidden">
                     <div className="bg-emerald-400 h-full w-[100%]" />
                   </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-8 border-t border-white/10">
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-[0.2em] mb-1">Last Audit</p>
              <p className="text-xs font-medium">Verified by AutoShield · {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-emerald-900">Customer Management</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none bg-white border border-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-50 transition-all">Export</button>
          <button 
            onClick={() => {
              setEditingUser(null);
              setFormData({ name: '', email: '', password: '', role: 'customer' });
              setShowAddModal(true);
            }}
            className="flex-1 sm:flex-none bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-emerald-50/50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {users.filter(u => u.role === 'customer').map(user => (
              <tr key={user.id} className="hover:bg-emerald-50/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                      {user.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900 text-sm">{user.name}</p>
                      <p className="text-xs text-emerald-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'farmer' ? 'bg-blue-100 text-blue-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${
                    user.status === 'approved' ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      user.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} /> {user.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/messages?farmerId=${user.id}&farmerName=${encodeURIComponent(user.name)}`)}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" 
                      title="Message User"
                    >
                      <MessageSquare size={18} />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingUser(user);
                        setFormData({ 
                          name: user.name, 
                          email: user.email, 
                          password: '', // Don't show password
                          role: user.role 
                        });
                        setShowAddModal(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                      title="Edit User"
                    >
                      <Edit2 size={18} />
                    </button>
                    {user.status !== 'approved' && (
                      <button 
                        onClick={() => handleUpdateStatus(user.id, 'approved')}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" 
                        title="Approve"
                      >
                        <UserCheck size={18} />
                      </button>
                    )}
                    {user.status === 'approved' && (
                      <button 
                        onClick={() => handleUpdateStatus(user.id, 'suspended')}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-all" 
                        title="Suspend"
                      >
                        <UserX size={18} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => handleDeleteUser(e, user.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.filter(u => u.role === 'customer').map(user => (
          <div key={user.id} className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg">
                  {user.name[0]}
                </div>
                <div>
                  <p className="font-bold text-emerald-900">{user.name}</p>
                  <p className="text-xs text-emerald-500">{user.email}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                user.role === 'farmer' ? 'bg-blue-100 text-blue-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {user.role}
              </span>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-emerald-50">
              <span className={`flex items-center gap-1.5 text-xs font-bold ${
                user.status === 'approved' ? 'text-emerald-700' : 'text-red-600'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  user.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'
                }`} /> {user.status}
              </span>
              <div className="flex gap-1">
                <button 
                  onClick={() => navigate(`/messages?farmerId=${user.id}&farmerName=${encodeURIComponent(user.name)}`)}
                  className="p-2 text-emerald-600 bg-emerald-50 rounded-xl"
                >
                  <MessageSquare size={18} />
                </button>
                <button 
                  onClick={() => {
                    setEditingUser(user);
                    setFormData({ name: user.name, email: user.email, password: '', role: user.role });
                    setShowAddModal(true);
                  }}
                  className="p-2 text-blue-600 bg-blue-50 rounded-xl"
                >
                  <Edit2 size={18} />
                </button>
                {user.status !== 'approved' ? (
                  <button onClick={() => handleUpdateStatus(user.id, 'approved')} className="p-2 text-emerald-600 bg-emerald-50 rounded-xl">
                    <UserCheck size={18} />
                  </button>
                ) : (
                  <button onClick={() => handleUpdateStatus(user.id, 'suspended')} className="p-2 text-orange-600 bg-orange-50 rounded-xl">
                    <UserX size={18} />
                  </button>
                )}
                <button onClick={(e) => handleDeleteUser(e, user.id)} className="p-2 text-red-600 bg-red-50 rounded-xl">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderProducts = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold text-emerald-900">Product Monitoring</h2>
        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] md:text-xs font-bold">
          Total: {products.length}
        </span>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-emerald-50/50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Farmer</th>
              <th className="px-6 py-4">Egg Type</th>
              <th className="px-6 py-4">Prices</th>
              <th className="px-6 py-4">Stock</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {products.map(product => (
              <tr key={product.id} className="hover:bg-emerald-50/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={product.image_url || EGG_PLACEHOLDER} className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <div>
                      <p className="font-bold text-emerald-900 text-sm">{product.name}</p>
                      <p className="text-[10px] text-emerald-500 uppercase">{product.category_name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-emerald-700 font-medium">{product.farmer_name}</td>
                <td className="px-6 py-4 text-sm text-emerald-600">{product.egg_type || '-'}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-bold text-emerald-900">₱{Number(product.price_per_tray).toFixed(2)} <span className="text-[10px] text-emerald-400 font-normal">/tray</span></p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs font-bold ${product.stock_tray < 5 ? 'text-orange-600' : 'text-emerald-700'}`}>
                      {product.stock_tray} trays
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={(e) => handleDeleteProduct(e, product.id)}
                    className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {products.map(product => (
          <div key={product.id} className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <img src={product.image_url || EGG_PLACEHOLDER} className="w-16 h-16 rounded-2xl object-cover" referrerPolicy="no-referrer" />
              <div className="flex-1">
                <h3 className="font-bold text-emerald-900">{product.name}</h3>
                <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">{product.category_name}</p>
                <p className="text-xs text-emerald-600 mt-1">Farmer: {product.farmer_name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-emerald-50">
              <div>
                <p className="text-[10px] text-emerald-500 uppercase font-bold mb-1">Stock</p>
                <div className="space-y-1">
                  <p className={`text-sm font-bold ${product.stock_tray < 5 ? 'text-orange-600' : 'text-emerald-900'}`}>{product.stock_tray} Trays</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-emerald-500 uppercase font-bold mb-1">Pricing</p>
                <p className="text-sm font-bold text-emerald-900">₱{Number(product.price_per_tray).toFixed(2)}/t</p>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-emerald-600">Type: {product.egg_type || '-'}</span>
              <button 
                onClick={(e) => handleDeleteProduct(e, product.id)}
                className="p-2 text-red-600 bg-red-50 rounded-xl"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="space-y-6">
      <h2 className="text-xl md:text-2xl font-bold text-emerald-900">Order Monitoring</h2>
      
      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-emerald-50/50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {orders.map(order => (
              <tr key={order.id} className="hover:bg-emerald-50/20 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-emerald-900">#{order.id}</td>
                <td className="px-6 py-4 text-sm text-emerald-800 font-medium">{order.customer_name}</td>
                <td className="px-6 py-4 text-sm font-bold text-emerald-900">₱{Number(order.total_amount).toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-emerald-500">{new Date(order.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                    order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                    order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    order.status === 'on the way' ? 'bg-purple-100 text-purple-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setSelectedOrder(order);
                        fetchOrderItems(order.id);
                      }}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="View Details"
                    >
                      <ClipboardList size={18} />
                    </button>
                    {(order.status === 'delivered' || order.status === 'cancelled') && (
                      <button 
                        onClick={(e) => handleDeleteOrder(e, order.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Order"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <p className="font-bold text-emerald-900">Order #{order.id}</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                order.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                order.status === 'on the way' ? 'bg-purple-100 text-purple-700' :
                'bg-red-100 text-red-700'
              }`}>
                {order.status}
              </span>
            </div>
            
            <div className="flex justify-between items-end pt-4 border-t border-emerald-50">
              <div>
                <p className="text-xs text-emerald-500 mb-1">Customer</p>
                <p className="font-bold text-emerald-900">{order.customer_name}</p>
                <p className="text-[10px] text-emerald-400 mt-1">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-500 mb-1">Total</p>
                <p className="text-xl font-display font-bold text-emerald-900">₱{Number(order.total_amount).toFixed(2)}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => {
                  setSelectedOrder(order);
                  fetchOrderItems(order.id);
                }}
                className="flex-1 bg-emerald-50 text-emerald-700 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              >
                <ClipboardList size={18} /> View details
              </button>
              {(order.status === 'delivered' || order.status === 'cancelled') && (
                <button 
                  onClick={(e) => handleDeleteOrder(e, order.id)}
                  className="px-4 bg-red-50 text-red-600 rounded-xl flex items-center justify-center"
                  title="Delete Order"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

  const renderReports = () => (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-emerald-900">Reports & Analytics</h2>
        <div className="flex gap-2">
          <button onClick={() => fetchData()} className="text-sm font-bold text-emerald-600 hover:underline">Refresh Data</button>
        </div>
      </div>

      {/* Revenue Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-emerald-100 shadow-sm p-8">
          <h3 className="font-bold text-emerald-900 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" />
            Revenue & Order Trends
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={reports.slice().reverse()}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0fdf4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={3} />
                <Area type="monotone" dataKey="order_count" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-8">
          <h3 className="font-bold text-emerald-900 mb-6 flex items-center gap-2">
            <Tags size={20} className="text-emerald-500" />
            Revenue by Category
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={categoryReports}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryReports.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {categoryReports.map((cat, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-emerald-700 font-medium">{cat.name}</span>
                </div>
                <span className="font-bold text-emerald-900">₱{Number(cat.value).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Farmers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-8">
          <h3 className="font-bold text-emerald-900 mb-6 flex items-center gap-2">
            <UserCheck size={20} className="text-emerald-500" />
            Top Performing Farmers
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={farmerReports} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0fdf4" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#10b981'}} width={100} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#10b981" radius={[0, 10, 10, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-emerald-900 rounded-3xl p-8 text-white flex flex-col justify-between shadow-xl shadow-emerald-200">
          <div>
            <BarChart3 size={40} className="text-emerald-400 mb-6" />
            <h3 className="text-2xl font-bold mb-4">Quick Insights</h3>
            <div className="space-y-6">
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                <p className="text-emerald-300 text-xs uppercase font-bold tracking-wider mb-1">Avg. Order Value</p>
                <p className="text-2xl font-bold">₱{(Number(stats?.totalRevenue) / (stats?.totalOrders || 1)).toFixed(2)}</p>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                <p className="text-emerald-300 text-xs uppercase font-bold tracking-wider mb-1">Customer Conversion</p>
                <p className="text-2xl font-bold">{((stats?.totalOrders / (stats?.totalUsers || 1)) * 100).toFixed(1)}%</p>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                <p className="text-emerald-300 text-xs uppercase font-bold tracking-wider mb-1">Active Categories</p>
                <p className="text-2xl font-bold">{categories.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFarmers = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-emerald-900">Farmer Management</h2>
        <div className="flex gap-2">
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
            Total Farmers: {users.filter(u => u.role === 'farmer').length}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-emerald-50/50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Farmer</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {users.filter(u => u.role === 'farmer').map(farmer => (
              <tr key={farmer.id} className="hover:bg-emerald-50/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                      {farmer.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900 text-sm">{farmer.name}</p>
                      <p className="text-xs text-emerald-500">{farmer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-emerald-700">{farmer.phone || 'No phone'}</p>
                  <p className="text-[10px] text-emerald-500">{farmer.address || 'No address'}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${
                    farmer.status === 'approved' ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      farmer.status === 'approved' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} /> {farmer.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => fetchFarmerDetails(farmer)}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" 
                      title="View Details"
                    >
                      <ClipboardList size={18} />
                    </button>
                    <button 
                      onClick={() => navigate(`/messages?farmerId=${farmer.id}&farmerName=${encodeURIComponent(farmer.name)}`)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                      title="Message Farmer"
                    >
                      <MessageSquare size={18} />
                    </button>
                    {farmer.status !== 'approved' && (
                      <button 
                        onClick={() => handleUpdateStatus(farmer.id, 'approved')}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" 
                        title="Approve"
                      >
                        <UserCheck size={18} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => handleDeleteUser(e, farmer.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                      title="Delete Farmer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const fetchPendingVerifications = async () => {
    try {
      const res = await fetch('/api/admin/pending-verifications');
      if (res.ok) {
        setPendingVerifications(await res.json());
      }
    } catch (err) {
      console.error('Error fetching pending verifications:', err);
    }
  };

  const handleVerifyFarmer = async (farmerId: number, status: 'verified' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/verify-farmer/${farmerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (res.ok) {
        showNotify(`Farmer ${status === 'verified' ? 'verified' : 'rejected'} successfully`, 'success');
        fetchPendingVerifications();
        fetchData(); // Refresh users list too
      } else {
        const data = await res.json();
        showNotify(data.error || 'Failed to update verification status', 'error');
      }
    } catch (err) {
      showNotify('An error occurred', 'error');
    }
  };

  const renderVerifications = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-emerald-900">Farmer Verification Requests</h2>
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
          {pendingVerifications.length} Pending
        </span>
      </div>

      {pendingVerifications.length === 0 ? (
        <div className="bg-white rounded-3xl border border-emerald-100 p-12 text-center shadow-sm">
          <ShieldCheck size={48} className="mx-auto text-emerald-200 mb-4" />
          <h3 className="font-bold text-emerald-900 mb-1 font-serif text-lg">All caught up!</h3>
          <p className="text-emerald-500 text-sm">There are no pending farmer verification requests at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingVerifications.map(farmer => (
            <motion.div 
              key={farmer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-emerald-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-emerald-200 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xl">
                  {farmer.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-emerald-900 text-lg">{farmer.name}</h3>
                  <p className="text-sm text-emerald-500 mb-1">{farmer.email}</p>
                  <a 
                    href={farmer.verification_document} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline"
                  >
                    <FileText size={14} /> View Identification Document
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleVerifyFarmer(farmer.id, 'rejected')}
                  className="flex-1 md:flex-none border border-red-100 text-red-600 px-6 py-3 rounded-2xl text-sm font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                >
                  <XCircle size={18} /> Reject
                </button>
                <button 
                  onClick={() => handleVerifyFarmer(farmer.id, 'verified')}
                  className="flex-1 md:flex-none bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                >
                  <UserCheck size={18} /> Approve & Verify
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  const handleUpdateSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        showNotify('Settings updated successfully!', 'success');
        fetchData();
      } else {
        showNotify('Failed to update settings', 'error');
      }
    } catch (err) {
      showNotify('An error occurred while saving settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const renderSettings = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-emerald-900">System Settings</h2>
      <div className="max-w-2xl bg-white rounded-3xl border border-emerald-100 shadow-sm p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Platform Name</label>
            <input 
              type="text" 
              value={settingsForm?.site_name || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, site_name: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., EggMarket"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Contact Email</label>
            <input 
              type="email" 
              value={settingsForm?.contact_email || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, contact_email: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., support@eggmarket.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Contact Phone</label>
            <input 
              type="text" 
              value={settingsForm?.contact_phone || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, contact_phone: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., 09350347461"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Contact Address</label>
            <textarea 
              value={settingsForm?.contact_address || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, contact_address: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none min-h-[100px] resize-none"
              placeholder="e.g., canipaan hinunangan Egg Valley"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Site Description</label>
            <textarea 
              value={settingsForm?.site_description || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, site_description: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none min-h-[120px] resize-none"
              placeholder="Describe the platform..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-emerald-700">Facebook Page URL</label>
            <input 
              type="url" 
              value={settingsForm?.facebook_url || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, facebook_url: e.target.value })}
              className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="https://facebook.com/yourpage"
            />
          </div>
          
          <div className="pt-6 border-t border-emerald-50">
            <button 
              onClick={handleUpdateSettings}
              disabled={savingSettings}
              className={`w-full md:w-auto px-12 py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                savingSettings 
                  ? 'bg-emerald-100 text-emerald-300 cursor-not-allowed shadow-none' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100 active:scale-[0.98]'
              }`}
            >
              {savingSettings ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-emerald-900 capitalize">
          {activeTab.replace('-', ' ')}
        </h1>

        {['dashboard', 'orders', 'reports'].includes(activeTab) && (
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-emerald-100 shadow-sm w-full md:w-auto">
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl">
              <ClipboardList size={16} className="text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700 uppercase">Filter</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-emerald-900 outline-none p-1"
              />
              <span className="text-emerald-300 text-xs">to</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-emerald-900 outline-none p-1"
              />
              {(startDate || endDate) && (
                <button 
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="p-1 hover:bg-red-50 text-red-400 rounded-lg transition-all"
                  title="Clear Filter"
                >
                  <XCircle size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'dashboard' && renderOverview()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'farmers' && renderFarmers()}
      {activeTab === 'verifications' && renderVerifications()}
      {activeTab === 'categories' && renderCategories()}
      {activeTab === 'products' && renderProducts()}
      {activeTab === 'orders' && renderOrders()}
      {activeTab === 'reports' && renderReports()}
      {activeTab === 'settings' && renderSettings()}
      {activeTab === 'messages' && (
        <div className="h-[calc(100vh-12rem)]">
          <MessagingSystem />
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-emerald-900/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-xl">Order Details</h3>
                <p className="text-emerald-100 text-xs">Order #{selectedOrder.id} • {new Date(selectedOrder.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="hover:bg-white/20 p-1 rounded-lg transition-all">
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-emerald-50 pb-4">
                  <div>
                    <h4 className="font-bold text-emerald-900">Customer</h4>
                    <p className="text-sm text-emerald-600">{selectedOrder.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <h4 className="font-bold text-emerald-900">Status</h4>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                      selectedOrder.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                      selectedOrder.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      selectedOrder.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      selectedOrder.status === 'on the way' ? 'bg-purple-100 text-purple-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                <h4 className="font-bold text-emerald-900">Items Ordered</h4>
                <div className="space-y-4">
                  {orderItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <img src={item.image_url || EGG_PLACEHOLDER} className="w-16 h-16 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                        <div>
                          <p className="font-bold text-emerald-900">{item.name}</p>
                          <div className="flex flex-col">
                            {item.egg_type && (
                              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Type: {item.egg_type}</p>
                            )}
                            <p className="text-sm text-emerald-500">{item.quantity} {item.unit || 'unit'}(s) x ₱{Number(item.price).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                      <p className="font-bold text-emerald-900">₱{(Number(item.quantity) * Number(item.price)).toFixed(2)}</p>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-emerald-50 flex justify-between items-center">
                  <span className="text-emerald-600 font-bold">Total Amount</span>
                  <span className="text-3xl font-bold text-emerald-900">₱{Number(selectedOrder.total_amount).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-emerald-50 flex gap-3 justify-end shrink-0">
              {(selectedOrder.status === 'delivered' || selectedOrder.status === 'cancelled') && (
                <button 
                  onClick={(e) => handleDeleteOrder(e, selectedOrder.id)}
                  className="px-6 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center gap-2"
                >
                  <Trash2 size={18} /> Delete Order
                </button>
              )}
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-6 py-3 bg-white text-emerald-600 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-50 transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setItemToDelete(null);
          setDeleteType(null);
        }}
        onConfirm={confirmDelete}
        title={`Delete ${deleteType === 'user' ? 'User' : deleteType === 'category' ? 'Category' : deleteType === 'order' ? 'Order' : 'Product'}`}
        message={`Are you sure you want to delete this ${deleteType}? This action cannot be undone.`}
        confirmText="Delete"
      />

      {/* Farmer Details Modal */}
      <AnimatePresence>
        {selectedFarmer && (
          <div className="fixed inset-0 bg-emerald-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-8 bg-emerald-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-800 flex items-center justify-center text-2xl font-bold">
                    {selectedFarmer.name[0]}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{selectedFarmer.name}</h3>
                    <p className="text-emerald-300 text-sm">{selectedFarmer.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedFarmer(null)}
                  className="p-2 hover:bg-emerald-800 rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                {loadingFarmerDetails ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                    <p className="text-emerald-600 font-medium italic">Loading farmer insights...</p>
                  </div>
                ) : farmerDetails ? (
                  <div className="space-y-10">
                    {/* Stats Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Products</p>
                        <p className="text-3xl font-bold text-emerald-900">{farmerDetails.products.length}</p>
                      </div>
                      <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Average Rating</p>
                        <div className="flex items-center gap-2">
                          <p className="text-3xl font-bold text-emerald-900">
                            {farmerDetails.stats?.average_rating?.toFixed(1) || '0.0'}
                          </p>
                          <Star className="text-orange-400 fill-orange-400" size={20} />
                        </div>
                      </div>
                      <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Reviews</p>
                        <p className="text-3xl font-bold text-emerald-900">{farmerDetails.stats?.review_count || 0}</p>
                      </div>
                    </div>

                    {/* Top Products */}
                    <div>
                      <h4 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
                        <Package size={20} className="text-emerald-600" />
                        Top Selling Products
                      </h4>
                      <div className="space-y-3">
                        {farmerDetails.sales.length > 0 ? (
                          farmerDetails.sales.map((sale, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white border border-emerald-50 rounded-2xl hover:border-emerald-200 transition-all">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold">
                                  {idx + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-emerald-900">{sale.name}</p>
                                  <p className="text-xs text-emerald-500">{sale.total_sold} units sold</p>
                                </div>
                              </div>
                              <p className="font-bold text-emerald-700">₱{Number(sale.total_revenue).toFixed(2)}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-emerald-500 italic">No sales data available yet.</p>
                        )}
                      </div>
                    </div>

                    {/* Recent Reviews */}
                    <div>
                      <h4 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
                        <Star size={20} className="text-emerald-600" />
                        Recent Reviews
                      </h4>
                      <div className="space-y-4">
                        {farmerDetails.reviews.length > 0 ? (
                          farmerDetails.reviews.slice(0, 3).map((review, idx) => (
                            <div key={idx} className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                              <div className="flex justify-between items-start mb-2">
                                <p className="font-bold text-emerald-900 text-sm">{review.customer_name}</p>
                                <div className="flex gap-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <Star 
                                      key={i} 
                                      size={12} 
                                      className={i < review.rating ? "text-orange-400 fill-orange-400" : "text-emerald-200"} 
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-emerald-700 italic">"{review.comment}"</p>
                              <p className="text-[10px] text-emerald-400 mt-2">
                                {new Date(review.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-emerald-500 italic">No reviews yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="p-6 bg-emerald-50 flex justify-end shrink-0">
                <button 
                  onClick={() => setSelectedFarmer(null)}
                  className="px-6 py-3 bg-white text-emerald-600 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-50 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-emerald-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-xl">{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={() => {
                setShowAddModal(false);
                setEditingUser(null);
              }} className="hover:bg-white/20 p-1 rounded-lg transition-all">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">
                  {error}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Full Name</label>
                <input 
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" required
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Password {editingUser && '(Leave blank to keep current)'}</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required={!editingUser}
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-4 pr-12 py-2 bg-emerald-50 border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Role</label>
                <div className="w-full px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-900 text-sm font-medium">
                  Customer (Locked)
                </div>
              </div>
              <button 
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 transition-all active:scale-95 mt-4"
              >
                {editingUser ? 'Update Customer' : 'Create Customer'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-emerald-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-xl">{editingCategory ? 'Edit Category' : 'Add New Category'}</h3>
              <button onClick={() => setShowCategoryModal(false)} className="hover:bg-white/20 p-1 rounded-lg transition-all">
                <XCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">
                  {error}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Category Name</label>
                <input 
                  type="text" required
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  className="w-full px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Organic Eggs"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 transition-all active:scale-95 mt-4 flex items-center justify-center gap-2"
              >
                <Save size={20} /> {editingCategory ? 'Update Category' : 'Create Category'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </DashboardLayout>
  );
}
