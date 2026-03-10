# backend/chatbot/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.handle_chat_message, name='chatbot-message'),
    path('conversations/', views.get_conversations, name='chatbot-conversations'),
    path('conversations/<int:conversation_id>/', views.get_conversation_detail, name='chatbot-conversation-detail'),
]
