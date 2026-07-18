import React, { useState, useEffect, useMemo } from "react";

import {
  Search,
  Plus,
  Barcode,
  CalendarDays,
  MapPin,
  Snowflake,
  Sun,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  X,
  Package,
  Settings,
  Save,
  Cloud,
  HardDrive,
  FileUp,
  Camera,
  Loader2,
} from "lucide-react";

const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();

      return;
    }

    const script = document.createElement("script");

    script.src = src;

    script.onload = () => resolve();

    script.onerror = () => reject(new Error(`Script load error for ${src}`));

    document.head.appendChild(script);
  });
};

const getTodayStr = () => {
  const today = new Date();

  const yyyy = today.getFullYear();

  const mm = String(today.getMonth() + 1).padStart(2, "0");

  const dd = String(today.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
};

// 🌟 真實的 Firebase 金鑰 🌟

const firebaseConfig = {
  apiKey: "AIzaSyAWjwBTH3Wsv7ZSkR73W1o8hULF5uiWIws",

  authDomain: "ikea-36103.firebaseapp.com",

  projectId: "ikea-36103",

  storageBucket: "ikea-36103.firebasestorage.app",

  messagingSenderId: "174471808960",

  appId: "1:174471808960:web:27b2c4fff31422ce1bea25",

  measurementId: "G-LFL5ZDV54C",
};

export default function ExpiryManager() {
  const [db, setDb] = useState(null);

  const [useLocalMode, setUseLocalMode] = useState(true);

  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");

  const [locations, setLocations] = useState([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [newLocationInput, setNewLocationInput] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);

  const defaultForm = {
    barcode: "",

    name: "",

    category: "room_temp",

    location: "",

    receiveDate: getTodayStr(),

    expiryDate: "",

    quantity: 1,

    reminderDays: 7,
  };

  const [formData, setFormData] = useState(defaultForm);

  const [editingId, setEditingId] = useState(null);

  const [isImporting, setIsImporting] = useState(false);

  const [isOcrScanning, setIsOcrScanning] = useState(false);

  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);

  const [librariesLoaded, setLibrariesLoaded] = useState(false);

  // 載入外部套件 (XLSX, Tesseract, Firebase, Html5Qrcode)

  useEffect(() => {
    const loadLibs = async () => {
      try {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
        );

        await loadScript(
          "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
        );

        await loadScript("https://unpkg.com/html5-qrcode");

        await loadScript(
          "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"
        );

        await loadScript(
          "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"
        );

        await loadScript(
          "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"
        );

        setLibrariesLoaded(true);
      } catch (e) {
        console.error("載入外部套件失敗", e);
      }
    };

    loadLibs();
  }, []);

  // 初始化 Firebase

  useEffect(() => {
    if (!librariesLoaded) return;

    const initFirebase = async () => {
      if (!firebaseConfig.apiKey) {
        console.log(
          "未偵測到 Firebase API Key，啟用單機測試模式 (LocalStorage)"
        );

        loadLocalData();

        return;
      }

      try {
        if (!window.firebase.apps.length) {
          window.firebase.initializeApp(firebaseConfig);
        }

        const firestoreDb = window.firebase.firestore();

        const auth = window.firebase.auth();

        await auth.signInAnonymously();

        console.log("Firebase 匿名登入成功，切換至雲端模式");

        setDb(firestoreDb);

        setUseLocalMode(false);

        // 監聽商品資料

        firestoreDb.collection("products").onSnapshot(
          (snapshot) => {
            const productsData = snapshot.docs.map((doc) => ({
              id: doc.id,

              ...doc.data(),
            }));

            productsData.sort(
              (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
            );

            setProducts(productsData);

            setLoading(false);
          },

          (error) => {
            console.error("Firebase 讀取權限錯誤:", error);

            alert(
              "資料庫連線失敗，請檢查 Firebase 安全規則是否設定為 allow read, write: if true;"
            );

            loadLocalData();
          }
        );

        // 監聽設定資料 (地點)

        firestoreDb

          .collection("settings")

          .doc("global")

          .onSnapshot((docSnap) => {
            if (docSnap.exists && docSnap.data().locations) {
              setLocations(docSnap.data().locations);
            } else {
              firestoreDb

                .collection("settings")

                .doc("global")

                .set({
                  locations: ["倉庫A", "展示架", "冷藏室", "冷凍庫"],
                });
            }
          });
      } catch (error) {
        console.error("Firebase 初始化失敗，退回單機模式", error);

        loadLocalData();
      }
    };

    initFirebase();
  }, [librariesLoaded]);

  const loadLocalData = () => {
    setUseLocalMode(true);

    const localProducts =
      JSON.parse(localStorage.getItem("expiry_manager_products")) || [];

    const localSettings = JSON.parse(
      localStorage.getItem("expiry_manager_settings")
    ) || { locations: ["倉庫A", "展示架", "冷藏室", "冷凍庫"] };

    setProducts(localProducts);

    setLocations(localSettings.locations);

    setLoading(false);
  };

  // 自動帶入商品主檔邏輯

  useEffect(() => {
    if (formData.barcode && !editingId) {
      const fetchMasterData = async () => {
        if (!useLocalMode && db) {
          try {
            // 雲端查詢主檔

            const masterRef = db

              .collection("master_products")

              .doc(formData.barcode);

            const docSnap = await masterRef.get();

            if (docSnap.exists) {
              const masterData = docSnap.data();

              setFormData((prev) => ({
                ...prev,

                name: prev.name || masterData.name,

                category: masterData.category || prev.category,

                reminderDays: masterData.reminderDays || prev.reminderDays,
              }));

              return; // 找到雲端主檔就結束
            }
          } catch (e) {
            console.error("查詢商品主檔失敗", e);
          }
        }

        // 若雲端查不到，或單機模式，則檢查現有庫存 (作為暫時主檔)

        const existingProduct = products.find(
          (p) => p.barcode === formData.barcode
        );

        if (existingProduct) {
          setFormData((prev) => ({
            ...prev,

            name: prev.name || existingProduct.name,

            category: existingProduct.category,

            location: prev.location || existingProduct.location,

            reminderDays: existingProduct.reminderDays,
          }));
        }
      };

      fetchMasterData();
    }
  }, [formData.barcode, products, editingId, db, useLocalMode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 相機掃描實體條碼

  const handleStartBarcodeScanner = () => {
    if (!window.Html5QrcodeScanner) {
      alert("掃描套件載入中，請稍後再試。");

      return;
    }

    setIsBarcodeScanning(true);

    // 稍微延遲以確保 DOM 已經渲染出 reader 容器

    setTimeout(() => {
      const html5QrcodeScanner = new window.Html5QrcodeScanner(
        "reader",

        { fps: 10, qrbox: { width: 250, height: 150 } },

        /* verbose= */ false
      );

      html5QrcodeScanner.render(
        (decodedText, decodedResult) => {
          // 掃描成功

          console.log(`掃描結果: ${decodedText}`);

          setFormData((prev) => ({ ...prev, barcode: decodedText }));

          // 停止掃描

          html5QrcodeScanner

            .clear()

            .then(() => {
              setIsBarcodeScanning(false);
            })

            .catch((error) => {
              console.error("Failed to clear html5QrcodeScanner. ", error);
            });
        },

        (errorMessage) => {
          // 忽略掃描過程中的錯誤 (例如沒對準)
        }
      );
    }, 100);
  };

  const handleStopBarcodeScanner = () => {
    setIsBarcodeScanning(false);

    // 注意：完整的清理通常需要在 scanner 實例上呼叫 clear()

    // 這裡為了簡化，直接隱藏 UI，下次掃描會重新建立
  };

  // Excel 匯入邏輯

  const handleExcelImport = (e) => {
    if (!librariesLoaded || !window.XLSX) {
      alert("Excel 解析套件載入中，請稍後再試。");

      return;
    }

    const file = e.target.files[0];

    if (!file) return;

    setIsImporting(true);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;

        const wb = window.XLSX.read(bstr, { type: "binary", cellDates: true });

        const ws = wb.Sheets[wb.SheetNames[0]];

        const data = window.XLSX.utils.sheet_to_json(ws);

        const newProducts = [];

        const masterUpdates = []; // 準備更新商品主檔

        for (const row of data) {
          const parseDate = (val) => {
            if (!val) return "";

            if (val instanceof Date) {
              return `${val.getFullYear()}-${String(
                val.getMonth() + 1
              ).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
            }

            return String(val).replace(/\//g, "-").replace(/\./g, "-");
          };

          const barcode = String(
            row["條碼"] ||
              row["商品條碼"] ||
              Math.floor(1000000000000 + Math.random() * 9000000000000)
          );

          const name = String(row["品名"] || row["商品名稱"] || "未命名商品");

          const category = String(row["溫層"] || "").includes("冷凍")
            ? "frozen"
            : "room_temp";

          const reminderDays = Number(row["提醒天數"] || 7);

          const product = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),

            barcode: barcode,

            name: name,

            category: category,

            location: String(row["地點"] || row["存放地點"] || ""),

            receiveDate:
              parseDate(row["進貨日"] || row["進貨日期"]) || getTodayStr(),

            expiryDate: parseDate(row["有效期限"] || row["到期日"]),

            quantity: Number(row["數量"] || 1),

            reminderDays: reminderDays,

            updatedAt: new Date().toISOString(),
          };

          if (product.name && product.expiryDate) {
            newProducts.push(product);

            // 記錄要更新主檔的資料

            masterUpdates.push({
              barcode: product.barcode,

              name: product.name,

              category: product.category,

              reminderDays: product.reminderDays,
            });
          }
        }

        if (useLocalMode) {
          const updatedProducts = [...products, ...newProducts];

          updatedProducts.sort(
            (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
          );

          setProducts(updatedProducts);

          localStorage.setItem(
            "expiry_manager_products",

            JSON.stringify(updatedProducts)
          );
        } else if (db) {
          // 寫入 Firebase

          const batch = db.batch();

          for (const prod of newProducts) {
            const docRef = db.collection("products").doc(prod.id);

            batch.set(docRef, prod);
          }

          // 同時更新商品主檔

          for (const master of masterUpdates) {
            const masterRef = db

              .collection("master_products")

              .doc(master.barcode);

            batch.set(masterRef, master, { merge: true });
          }

          await batch.commit();
        }

        // 使用原生的 toast 或 custom alert 替代 window.alert

        const toast = document.createElement("div");

        toast.className =
          "fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[100] animate-in slide-in-from-top-10 fade-in duration-300 font-medium";

        toast.innerText = `成功匯入 ${newProducts.length} 筆資料！`;

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.classList.add("fade-out", "opacity-0");

          setTimeout(() => toast.remove(), 300);
        }, 3000);
      } catch (error) {
        console.error("Excel 匯入失敗", error);

        alert("Excel 匯入失敗，請確認檔案格式是否正確。");
      } finally {
        setIsImporting(false);

        e.target.value = null;
      }
    };

    reader.readAsBinaryString(file);
  };

  // 相機 OCR 日期辨識

  const handleCameraCapture = async (e) => {
    if (!librariesLoaded || !window.Tesseract) {
      alert("OCR 辨識套件載入中，請稍後再試。");

      return;
    }

    const file = e.target.files[0];

    if (!file) return;

    setIsOcrScanning(true);

    try {
      const worker = await window.Tesseract.createWorker("eng");

      const ret = await worker.recognize(file);

      const text = ret.data.text;

      console.log("OCR 辨識結果:", text);

      await worker.terminate();

      const dateRegexes = [
        /(20\d{2})[-/.\s](0[1-9]|1[0-2])[-/.\s](0[1-9]|[12]\d|3[01])/,

        /(\d{2})[-/.\s](0[1-9]|1[0-2])[-/.\s](0[1-9]|[12]\d|3[01])/,
      ];

      let foundDate = null;

      for (const regex of dateRegexes) {
        const match = text.match(regex);

        if (match) {
          let year = match[1].length === 2 ? `20${match[1]}` : match[1];

          let month = match[2].padStart(2, "0");

          let day = match[3].padStart(2, "0");

          foundDate = `${year}-${month}-${day}`;

          break;
        }
      }

      if (foundDate) {
        setFormData((prev) => ({ ...prev, expiryDate: foundDate }));
      } else {
        alert("相機辨識找不到標準日期格式，請重新拍攝或手動輸入。");
      }
    } catch (error) {
      console.error("相機辨識失敗", error);

      alert("相機辨識失敗，請確認圖片是否清晰。");
    } finally {
      setIsOcrScanning(false);

      e.target.value = null;
    }
  };

  // 提交表單邏輯

  const handleSubmit = async (e) => {
    e.preventDefault();

    const dataToSave = {
      ...formData,

      quantity: Number(formData.quantity),

      reminderDays: Number(formData.reminderDays),

      updatedAt: new Date().toISOString(),
    };

    // 準備更新商品主檔的資料 (獨立於庫存，只記基本屬性)

    const masterData = {
      name: dataToSave.name,

      category: dataToSave.category,

      reminderDays: dataToSave.reminderDays,

      updatedAt: dataToSave.updatedAt,
    };

    if (useLocalMode) {
      let updatedProducts;

      if (editingId) {
        updatedProducts = products.map((p) =>
          p.id === editingId ? { ...dataToSave, id: editingId } : p
        );
      } else {
        updatedProducts = [
          ...products,

          { ...dataToSave, id: Date.now().toString() },
        ];
      }

      updatedProducts.sort(
        (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
      );

      setProducts(updatedProducts);

      localStorage.setItem(
        "expiry_manager_products",

        JSON.stringify(updatedProducts)
      );
    } else if (db) {
      const batch = db.batch();

      // 更新/新增 庫存資料

      if (editingId) {
        const docRef = db.collection("products").doc(editingId);

        batch.update(docRef, dataToSave);
      } else {
        const docRef = db.collection("products").doc();

        batch.set(docRef, dataToSave);
      }

      // 同時更新/新增 商品主檔

      if (formData.barcode) {
        const masterRef = db

          .collection("master_products")

          .doc(formData.barcode);

        batch.set(masterRef, masterData, { merge: true });
      }

      await batch.commit();
    }

    setIsModalOpen(false);

    setFormData(defaultForm);

    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("確定要刪除這筆庫存嗎？")) return;

    if (useLocalMode) {
      const updatedProducts = products.filter((p) => p.id !== id);

      setProducts(updatedProducts);

      localStorage.setItem(
        "expiry_manager_products",

        JSON.stringify(updatedProducts)
      );
    } else if (db) {
      await db.collection("products").doc(id).delete();
    }
  };

  const handleEdit = (product) => {
    setFormData(product);

    setEditingId(product.id);

    setIsModalOpen(true);
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();

    const newLoc = newLocationInput.trim();

    if (!newLoc || locations.includes(newLoc)) return;

    const updatedLocations = [...locations, newLoc];

    if (useLocalMode) {
      setLocations(updatedLocations);

      localStorage.setItem(
        "expiry_manager_settings",

        JSON.stringify({ locations: updatedLocations })
      );
    } else if (db) {
      await db

        .collection("settings")

        .doc("global")

        .update({ locations: updatedLocations });
    }

    setNewLocationInput("");
  };

  const handleDeleteLocation = async (locToDelete) => {
    if (
      !window.confirm(
        `確定要刪除地點「${locToDelete}」嗎？\n(注意：現有商品的地點紀錄將不受影響，但未來無法再選取此地點)`
      )
    )
      return;

    const updatedLocations = locations.filter((l) => l !== locToDelete);

    if (useLocalMode) {
      setLocations(updatedLocations);

      localStorage.setItem(
        "expiry_manager_settings",

        JSON.stringify({ locations: updatedLocations })
      );
    } else if (db) {
      await db

        .collection("settings")

        .doc("global")

        .update({ locations: updatedLocations });
    }
  };

  const getExpiryStatus = (expiryDate, reminderDays) => {
    const today = new Date(getTodayStr());

    const expDate = new Date(expiryDate);

    const diffTime = expDate - today;

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0)
      return {
        status: "expired",

        label: "已過期",

        color: "text-red-600",

        bg: "bg-red-50",

        border: "border-red-200",

        days: Math.abs(diffDays),
      };

    if (diffDays <= reminderDays)
      return {
        status: "warning",

        label: "即將過期",

        color: "text-orange-600",

        bg: "bg-orange-50",

        border: "border-orange-200",

        days: diffDays,
      };

    return {
      status: "safe",

      label: "效期正常",

      color: "text-green-600",

      bg: "bg-green-50",

      border: "border-green-200",

      days: diffDays,
    };
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery)
  );

  const stats = {
    total: products.length,

    warning: products.filter(
      (p) => getExpiryStatus(p.expiryDate, p.reminderDays).status === "warning"
    ).length,

    expired: products.filter(
      (p) => getExpiryStatus(p.expiryDate, p.reminderDays).status === "expired"
    ).length,
  };

  // UI 渲染

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 relative">
      {/* Header */}

      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Package className="text-white w-6 h-6" />
            </div>

            <h1 className="text-xl font-bold text-slate-800 flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              效期管家
              {useLocalMode ? (
                <span className="text-xs text-gray-600 font-normal bg-gray-100 px-2 py-1 rounded-full border border-gray-200 flex items-center w-fit">
                  <HardDrive className="w-3 h-3 mr-1" />
                  單機測試模式
                </span>
              ) : (
                <span className="text-xs text-blue-600 font-normal bg-blue-50 px-2 py-1 rounded-full border border-blue-200 flex items-center w-fit shadow-sm">
                  <Cloud className="w-3 h-3 mr-1" />
                  雲端協作版
                </span>
              )}
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="hidden md:flex bg-white hover:bg-gray-50 text-slate-700 px-4 py-2 rounded-lg items-center gap-2 transition shadow-sm border border-gray-200 font-medium"
            >
              <Settings className="w-4 h-4" />
              地點設定
            </button>

            <label className="hidden md:flex bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg items-center gap-2 transition shadow-sm font-medium cursor-pointer">
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileUp className="w-4 h-4" />
              )}

              {isImporting ? "匯入中..." : "Excel 匯入"}

              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={handleExcelImport}
              />
            </label>

            <button
              onClick={() => {
                setFormData(defaultForm);

                setEditingId(null);

                setIsModalOpen(true);
              }}
              className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg items-center gap-2 transition shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              新增商品
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Stats & Search */}

        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-700">
                {stats.total}
              </span>

              <span className="text-xs font-medium text-slate-500 mt-1">
                總批次
              </span>
            </div>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-orange-600">
                {stats.warning}
              </span>

              <span className="text-xs font-medium text-orange-700 mt-1">
                即將過期
              </span>
            </div>

            <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-red-600">
                {stats.expired}
              </span>

              <span className="text-xs font-medium text-red-700 mt-1">
                已過期
              </span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />

            <input
              type="text"
              placeholder="搜尋商品名稱或條碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        {/* Product List */}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100 border-dashed">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />

            <p className="text-gray-500 font-medium">尚無商品記錄</p>

            <p className="text-sm text-gray-400 mt-1">
              點擊右下角按鈕新增第一筆庫存
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const status = getExpiryStatus(
                product.expiryDate,

                product.reminderDays
              );

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-xl p-4 shadow-sm border ${status.border} relative overflow-hidden group`}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${status.bg

                      .replace("bg-", "bg-")

                      .replace("-50", "-400")}`}
                  />

                  <div className="flex justify-between items-start pl-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-800 text-lg">
                          {product.name}
                        </h3>

                        {product.category === "frozen" ? (
                          <span className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 font-medium">
                            <Snowflake className="w-3 h-3" /> 冷凍
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100 font-medium">
                            <Sun className="w-3 h-3" /> 常溫
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 font-mono">
                        <Barcode className="w-3.5 h-3.5" /> {product.barcode}
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-gray-400" />

                          {product.location || "未指定地點"}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-gray-400" />
                          數量:{" "}
                          <strong className="text-slate-800">
                            {product.quantity}
                          </strong>
                        </div>

                        <div className="flex items-center gap-1.5 col-span-2">
                          <CalendarDays className="w-4 h-4 text-gray-400" />
                          進貨: {product.receiveDate}{" "}
                          <span className="text-gray-300 mx-1">|</span> 到期:{" "}
                          {product.expiryDate}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full min-h-[100px]">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div
                        className={`mt-auto text-right px-2.5 py-1 rounded-lg ${status.bg} ${status.color} font-medium text-sm flex flex-col items-end`}
                      >
                        <span className="flex items-center gap-1">
                          {status.status === "safe" && (
                            <CheckCircle2 className="w-4 h-4" />
                          )}

                          {status.status === "warning" && (
                            <AlertTriangle className="w-4 h-4" />
                          )}

                          {status.status === "expired" && (
                            <X className="w-4 h-4" />
                          )}

                          {status.label}
                        </span>

                        <span className="text-xs mt-0.5 opacity-80">
                          {status.status === "expired"
                            ? `已過期 ${status.days} 天`
                            : `剩餘 ${status.days} 天`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Mobile FAB - Elevated to avoid CodeSandbox watermark */}

      <div className="md:hidden fixed bottom-28 right-6 flex flex-col gap-3 z-20">
        <label className="w-12 h-12 bg-emerald-600 text-white border border-transparent rounded-full shadow-lg flex items-center justify-center hover:bg-emerald-700 transition active:scale-95 mx-auto cursor-pointer">
          {isImporting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <FileUp className="w-5 h-5" />
          )}

          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            onChange={handleExcelImport}
          />
        </label>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-12 h-12 bg-white text-slate-700 border border-gray-200 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition active:scale-95 mx-auto"
        >
          <Settings className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            setFormData(defaultForm);

            setEditingId(null);

            setIsModalOpen(true);
          }}
          className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-blue-700 transition active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Settings Modal (Location Management) */}

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-500" />
                管理存放地點
              </h2>

              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto max-h-[50vh]">
              <div className="space-y-2">
                {locations.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-4">
                    尚未設定任何地點
                  </p>
                ) : (
                  locations.map((loc) => (
                    <div
                      key={loc}
                      className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100"
                    >
                      <span className="text-slate-700 font-medium">{loc}</span>

                      <button
                        onClick={() => handleDeleteLocation(loc)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <form onSubmit={handleAddLocation} className="flex gap-2">
                <input
                  type="text"
                  value={newLocationInput}
                  onChange={(e) => setNewLocationInput(e.target.value)}
                  placeholder="輸入新地點名稱..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />

                <button
                  type="submit"
                  disabled={!newLocationInput.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  新增
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingId ? (
                  <Edit2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <Plus className="w-5 h-5 text-blue-600" />
                )}

                {editingId ? "編輯商品" : "新增商品"}
              </h2>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5 flex-1 custom-scrollbar pb-24 sm:pb-4">
              <form
                id="productForm"
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* Barcode */}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    商品條碼
                  </label>

                  {isBarcodeScanning ? (
                    <div className="border-2 border-blue-500 rounded-lg overflow-hidden bg-black relative">
                      <div id="reader" className="w-full"></div>

                      <button
                        type="button"
                        onClick={handleStopBarcodeScanner}
                        className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />

                        <input
                          type="text"
                          name="barcode"
                          required
                          value={formData.barcode}
                          onChange={handleInputChange}
                          placeholder="請掃描或輸入..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition"
                          autoFocus
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleStartBarcodeScanner}
                        className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium whitespace-nowrap border border-blue-200 flex items-center gap-1"
                      >
                        <Camera className="w-4 h-4" /> 掃描
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-1">
                    💡 提示：掃描曾建檔過的條碼，會自動帶入歷史資訊。
                  </p>
                </div>

                {/* Name */}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    商品名稱
                  </label>

                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="例如：鮮乳、冷凍水餃..."
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      儲存溫層
                    </label>

                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,

                            category: "room_temp",
                          }))
                        }
                        className={`flex-1 flex justify-center items-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition ${
                          formData.category === "room_temp"
                            ? "bg-white shadow-sm text-amber-600"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        <Sun className="w-4 h-4" /> 常溫
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,

                            category: "frozen",
                          }))
                        }
                        className={`flex-1 flex justify-center items-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition ${
                          formData.category === "frozen"
                            ? "bg-white shadow-sm text-blue-600"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        <Snowflake className="w-4 h-4" /> 冷凍
                      </button>
                    </div>
                  </div>

                  {/* Location Dropdown */}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      存放地點
                    </label>

                    <select
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">請選擇地點...</option>

                      {locations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}

                      {/* 防呆機制：若舊資料的地點不在現有選單中，依然保留顯示 */}

                      {formData.location &&
                        !locations.includes(formData.location) && (
                          <option value={formData.location}>
                            {formData.location} (自訂/已停用)
                          </option>
                        )}
                    </select>
                  </div>
                </div>

                {/* Dates */}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      進貨日期
                    </label>

                    <input
                      type="date"
                      name="receiveDate"
                      required
                      value={formData.receiveDate}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      有效期限
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="date"
                        name="expiryDate"
                        required
                        value={formData.expiryDate}
                        onChange={handleInputChange}
                        className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      <label
                        className="flex items-center justify-center px-3 py-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition cursor-pointer border border-blue-200"
                        title="拍照辨識日期"
                      >
                        {isOcrScanning ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Camera className="w-5 h-5" />
                        )}

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleCameraCapture}
                        />
                      </label>
                    </div>

                    {isOcrScanning && (
                      <p className="text-xs text-blue-500 mt-1">
                        AI 相機辨識中，請稍候...
                      </p>
                    )}
                  </div>
                </div>

                {/* Quantity & Reminder */}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      數量
                    </label>

                    <input
                      type="number"
                      name="quantity"
                      min="1"
                      required
                      value={formData.quantity}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      到期前幾天提醒
                    </label>

                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />

                      <input
                        type="number"
                        name="reminderDays"
                        min="1"
                        required
                        value={formData.reminderDays}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end pb-8 sm:pb-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 text-slate-600 font-medium hover:bg-gray-200 rounded-lg transition"
              >
                取消
              </button>

              <button
                type="submit"
                form="productForm"
                className="px-5 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition shadow-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                儲存資料
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add custom styling for scrollbar */}

      <style
        dangerouslySetInnerHTML={{
          __html: `

        .custom-scrollbar::-webkit-scrollbar {

          width: 6px;

        }

        .custom-scrollbar::-webkit-scrollbar-track {

          background: transparent;

        }

        .custom-scrollbar::-webkit-scrollbar-thumb {

          background-color: #cbd5e1;

          border-radius: 20px;

        }

      `,
        }}
      />
    </div>
  );
}
