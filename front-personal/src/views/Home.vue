<template>
    <div class="menu-conteiner">
        <h1>House Organizer</h1>
        <div class="grid-menu">
            <route-link to="/kitchen-storage" class="menu-card kitchen">
                <span class="icon"></span>
                <h2>Kitchen Storage</h2>
                <p>Manage your kitchen inventory and storage efficiently.</p>
            </route-link>

            <route-link to="/finances" class="menu-card finances">
                <span class="icon"></span>
                <h2>Finances</h2>
                <p>Track your expenses and manage your household budget.</p>
            </route-link>
        </div>
    </div>
</template>

<style scoped>
.menu-conteiner {
    display: flex;
    text-align: center;
    flex-direction: column;
    align-items: center;
}

.grid-menu{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-top: 40px;
}

@media (min-width: 768px) {
  .grid-menu { grid-template-columns: 1fr 1fr; } /* Dos columnas en PC */
}

.menu-card {
  padding: 30px;
  border-radius: 15px;
  text-decoration: none;
  color: white;
  transition: transform 0.2s;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}

.menu-card:active { transform: scale(0.95); }

.kitchen { background-color: #4caf50; }
.money { background-color: #2196f3; }

.icon { font-size: 3rem; }
</style>