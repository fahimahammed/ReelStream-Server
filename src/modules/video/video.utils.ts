import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
// import ffmpegPath from 'ffmpeg-static';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { Buffer } from 'node:buffer';

const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

export const compressVideo = async (
    videoBuffer: Buffer,
    progressUpdate: (chunkSize: number) => void
): Promise<Buffer> => {

    const tempInputPath = path.join(tmpdir(), `input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(tmpdir(), `output_${Date.now()}.mp4`);

    try {
        await writeFileAsync(tempInputPath, videoBuffer);

        await new Promise<void>((resolve, reject) => {
            ffmpeg(tempInputPath)
                .outputOptions([
                    '-preset fast',  // ⚡ Faster encoding
                    '-crf 28',       // 🎯 Balance between quality & compression
                    '-b:v 1M',       // 📉 Bitrate control for smaller size
                    '-movflags +faststart' // 📲 Helps for streaming
                ])
                .output(tempOutputPath)
                .on('progress', (progress) => {
                    progressUpdate(progress.targetSize)
                })
                .on('end', () => resolve())
                .on('error', reject)
                .run();
        });

        const compressedBuffer = await readFileAsync(tempOutputPath);

        // Cleanup temporary files
        await unlinkAsync(tempInputPath);
        await unlinkAsync(tempOutputPath);

        return compressedBuffer;
    } catch (error) {
        await unlinkAsync(tempInputPath).catch(() => { });
        throw new Error('Error compressing video: ' + error);
    }
};

export async function generateVideoThumbnail(buffer: Buffer): Promise<Buffer> {
    const tempVideoPath = path.join(__dirname, 'temp_video.mp4');
    const tempThumbnailPath = path.join(__dirname, 'temp_thumbnail.png');

    // Write the incoming video buffer to a temporary file
    fs.writeFileSync(tempVideoPath, buffer);

    // Absolute paths for Docker volumes
    const inputDir = path.dirname(tempVideoPath);
    const outputDir = path.dirname(tempThumbnailPath);
    const inputFileName = path.basename(tempVideoPath);
    const outputFileName = path.basename(tempThumbnailPath);

    // Docker command
    const dockerCommand = `docker run --rm -v "${inputDir}:/input" -v "${outputDir}:/output" jrottenberg/ffmpeg -i /input/${inputFileName} -ss 00:00:01 -vframes 1 -s 1080x1920 /output/${outputFileName}`;

    return new Promise((resolve, reject) => {
        exec(dockerCommand, (err, stdout, stderr) => {
            if (err) {
                console.error('Error stderr:', stderr);
                reject(`Error generating thumbnail: ${stderr}`);
            } else {
                console.log('FFmpeg stdout:', stdout);
                const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);

                fs.unlinkSync(tempVideoPath);
                fs.unlinkSync(tempThumbnailPath);

                resolve(thumbnailBuffer);
            }
        });
    });
}


// if (!ffmpegPath) {
//     throw new Error('FFmpeg binary not found. Please ensure ffmpeg-static is installed correctly.');
// }

// ffmpeg.setFfmpegPath(ffmpegPath);

// export const generateVideoThumbnail = (videoBuffer: Buffer): Promise<Buffer> => {
//     return new Promise((resolve, reject) => {
//         const tempVideoPath = path.join(__dirname, 'temp_video.mp4');
//         const tempThumbnailPath = path.join(__dirname, 'temp_thumbnail.png');

//         fs.writeFileSync(tempVideoPath, videoBuffer);

//         // Generate the thumbnail using ffmpeg
//         ffmpeg(tempVideoPath)
//             .screenshots({
//                 count: 1,
//                 folder: __dirname,
//                 filename: 'temp_thumbnail.png',
//                 size: '1080x1920',
//             })
//             .on('end', () => {
//                 const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);

//                 // Clean up temporary files
//                 fs.unlinkSync(tempVideoPath);
//                 fs.unlinkSync(tempThumbnailPath);

//                 resolve(thumbnailBuffer);
//             })
//             .on('error', (err) => {
//                 fs.unlinkSync(tempVideoPath);
//                 reject(new Error('Error generating thumbnail: ' + err.message));
//             });
//     });
// };
