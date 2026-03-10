# backend/products/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # The route for all products: http://127.0.0.1:8000/api/products/
    path('', views.get_products, name='product-list'),
    path('categories/', views.get_categories, name='category-list'),
    path('vendor/dashboard/', views.vendor_dashboard_summary, name='vendor-dashboard-summary'),
    path('vendor/products/', views.vendor_products, name='vendor-products'),
    path('vendor/products/bulk-import/', views.vendor_products_bulk_import, name='vendor-products-bulk-import'),
    path('vendor/products/<int:product_id>/', views.vendor_product_detail, name='vendor-product-detail'),
    path('admin/products/', views.admin_products, name='admin-products'),
    path('admin/products/bulk-import/', views.admin_products_bulk_import, name='admin-products-bulk-import'),
    path('admin/products/<int:product_id>/', views.admin_product_detail, name='admin-product-detail'),
    
    # THE FIX: The route for a single product: http://127.0.0.1:8000/api/products/1/
    path('<str:pk>/', views.get_product, name='product-detail'),
]
