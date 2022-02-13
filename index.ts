import dotenv from 'dotenv';
import app from './app';

dotenv.config();

app.listen(process.env.PORT, () => {
    console.log(`Server running at port ${process.env.PORT}`);
});